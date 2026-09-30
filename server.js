const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

app.post("/run", (req, res) => {
    const { code, language } = req.body;

    if (!code || !language) {
        return res.json({
            output: "Code or language is missing."
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
            sourceFile = `Main.java`;
            command = `javac Main.java && java Main`;
            break;

        case "go":
            sourceFile = `temp_${id}.go`;
            command = `GO111MODULE=off go run ${sourceFile}`;
            break;

        case "rust":
            sourceFile = `temp_${id}.rs`;
            command = `rustc ${sourceFile} -o ${outputFile} && ./${outputFile}`;
            break;

        default:
            return res.json({
                output: "Unsupported language: " + language
            });
    }

    try {
        fs.writeFileSync(sourceFile, code);
    } catch (error) {
        return res.json({
            output: "File creation error:\n" + error.message
        });
    }

    exec(
        command,
        {
            timeout: 10000,
            maxBuffer: 2 * 1024 * 1024
        },
        (error, stdout, stderr) => {

            // Delete temporary files
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

            // Show compiler/runtime error
            if (error) {
                const details =
                    stderr ||
                    stdout ||
                    error.message ||
                    "Program execution failed.";

                return res.json({
                    output: "ERROR:\n\n" + details
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
    console.log("Online Compiler running on port " + PORT);
});
