const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

app.post("/run", (req, res) => {

  const { code, language } = req.body;

  const id = Date.now();

  let sourceFile = "";
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
      command = `gcc ${sourceFile} -o app_${id} && ./app_${id}`;
      break;

    case "cpp":
      sourceFile = `temp_${id}.cpp`;
      command = `g++ ${sourceFile} -o app_${id} && ./app_${id}`;
      break;

    case "java":
      sourceFile = "Main.java";
      command = `javac Main.java && java Main`;
      break;

    case "go":
      sourceFile = `temp_${id}.go`;
      command = `go run ${sourceFile}`;
      break;

    case "rust":
      sourceFile = `temp_${id}.rs`;
      command = `rustc ${sourceFile} -o app_${id} && ./app_${id}`;
      break;

    default:
      return res.json({
        output: "Unsupported language"
      });
  }

  fs.writeFileSync(sourceFile, code);

  exec(command, { timeout: 5000 }, (err, stdout, stderr) => {

    try {

      if (fs.existsSync(sourceFile))
        fs.unlinkSync(sourceFile);

    } catch {}

    if (err) {
      return res.json({
        output: stderr || err.message
      });
    }

    res.json({
      output: stdout
    });

  });

});

app.listen(process.env.PORT || 3000, () => {
  console.log("Compiler running");
});
