const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

const TIMEOUT = 30000;

app.post("/run", (req, res) => {
    const { code, language } = req.body;

    if (typeof code !== "string" || !language) {
        return res.status(400).json({
            output: "Code and language are required."
        });
    }

    const allowedLanguages = [
        "python",
        "javascript",
        "php",
        "c",
        "cpp",
        "java",
        "go",
        "rust"
    ];

    if (!allowedLanguages.includes(language)) {
        return res.status(400).json({
            output: "Unsupported language: " + language
        });
    }

    const runId = Date.now().toString();
    const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "online-compiler-")
    );

    let sourceFile = "";
    let command = "";

    if (language === "python") {
        sourceFile = "main.py";
        command = `python3 ${sourceFile}`;
    }

    else if (language === "javascript") {
        sourceFile = "main.js";
        command = `node ${sourceFile}`;
    }

    else if (language === "php") {
        sourceFile = "main.php";
        command = `php ${sourceFile}`;
    }

    else if (language === "c") {
        sourceFile = "main.c";
        command = `gcc ${sourceFile} -O2 -o program && ./program`;
    }

    else if (language === "cpp") {
        sourceFile = "main.cpp";
        command = `g++ ${sourceFile} -O2 -o program && ./program`;
    }

    else if (language === "java") {
        sourceFile = "Main.java";
        command = `javac Main.java && java -cp . Main`;
    }

    else if (language === "go") {
        sourceFile = "main.go";

        command =
            `GO111MODULE=off go build -o program ${sourceFile} && ./program`;
    }

    else if (language === "rust") {
        sourceFile = "main.rs";
        command = `rustc ${sourceFile} -O -o program && ./program`;
    }

    const sourcePath = path.join(workDir, sourceFile);

    try {
        fs.writeFileSync(sourcePath, code, "utf8");
    } catch (error) {
        fs.rmSync(workDir, {
            recursive: true,
            force: true
        });

        return res.status(500).json({
            output: "Could not create source file.\n\n" + error.message
        });
    }

    const env = {
        ...process.env,

        HOME: workDir,

        GO111MODULE: "off",

        GOPATH: path.join(workDir, "gopath"),

        GOCACHE: path.join(workDir, "gocache"),

        GOMODCACHE: path.join(workDir, "gomodcache")
    };

    exec(
        command,
        {
            cwd: workDir,
            env: env,
            timeout: TIMEOUT,
            maxBuffer: 5 * 1024 * 1024,
            shell: "/bin/bash"
        },
        (error, stdout, stderr) => {

            let output = "";

            if (error) {
                output += "ERROR\n\n";

                if (stderr && stderr.trim()) {
                    output += stderr;
                }

                else if (stdout && stdout.trim()) {
                    output += stdout;
                }

                else {
                    output += error.message;
                }

                if (error.killed) {
                    output +=
                        "\n\nExecution stopped: time limit exceeded.";
                }
            }

            else {
                output = stdout || "Program finished successfully.";
            }

            fs.rmSync(workDir, {
                recursive: true,
                force: true
            });

            return res.json({
                output: output
            });
        }
    );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        `Online Compiler running on port ${PORT}`
    );
});
