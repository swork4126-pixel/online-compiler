const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

app.post("/run", (req, res) => {
  const { code, language } = req.body;

  if (!code || !language) {
    return res.json({
      output: "Missing code or language"
    });
  }

  const id = Date.now();

  let sourceFile = "";
  let outputFile = `app_${id}`;
  let command = "";

  switch (language) {
    case "python":
      sourceFile = `temp_${id}.py`;
      command = `python3 ${sourceFile}`;
      break;

    case "javascript":
      sourceFile = `temp_${id}.js`;
      command = `node ${sourceFile}`;
      break;

    case "php":
      sourceFile = `temp_${id}.php`;
      command = `php ${sourceFile}`;
      break;

    case "c":
      sourceFile = `temp_${id}.c`;
      command = `gcc ${sourceFile} -o ${outputFile} && ./${outputFile}`;
      break;

    case "cpp":
      sourceFile = `temp_${id}.cpp`;
      command = `g++ ${sourceFile} -o ${outputFile} && ./${outputFile}`;
      break;

    case "java":
      sourceFile = "Main.java";
      command = `javac Main.java && java Main`;
      break;

    case "go":
      sourceFile = `temp_${id}.go`;
      command = `go run ${sourceFile} 2>&1`;
      break;

    case "rust":
      sourceFile = `temp_${id}.rs`;
      command = `rustc ${sourceFile} -o ${outputFile} && ./${outputFile}`;
      break;

    default:
      return res.json({
        output: "Unsupported language"
      });
  }

  try {
    fs.writeFileSync(sourceFile, code);
  } catch (e) {
    return res.json({
      output: e.message
    });
  }

  exec(
    command,
    {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    },
    (err, stdout, stderr) => {
      try {
        if (fs.existsSync(sourceFile)) {
          fs.unlinkSync(sourceFile);
        }

        if (fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile);
        }

        if (fs.existsSync("Main.class")) {
          fs.unlinkSync("Main.class");
        }
      } catch (_) {}

      if (err) {
        return res.json({
          output:
            stderr ||
            stdout ||
            err.message ||
            "Execution failed"
        });
      }

      return res.json({
        output: stdout || "Program finished successfully."
      });
    }
  );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Compiler running on port ${PORT}`);
});
