const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

/*
  Time limits
*/
const DEFAULT_TIMEOUT = 30000;
const GO_TIMEOUT = 120000;
const JAVA_TIMEOUT = 60000;
const RUST_TIMEOUT = 60000;

/*
  Shared Go cache.
  This helps later Go executions become faster.
*/
const GO_CACHE = "/tmp/go-build-cache";
const GO_PATH = "/tmp/go-path";

try {
    fs.mkdirSync(GO_CACHE, { recursive: true });
    fs.mkdirSync(GO_PATH, { recursive: true });
} catch (_) {}


function cleanup(dir) {
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    } catch (_) {}
}


app.post("/run", (req, res) => {

    const { code, language } = req.body;

    if (typeof code !== "string") {
        return res.status(400).json({
            output: "Invalid code."
        });
    }

    if (!language) {
        return res.status(400).json({
            output: "Language not selected."
        });
    }


    const supportedLanguages = [
        "python",
        "javascript",
        "php",
        "c",
        "cpp",
        "java",
        "go",
        "rust"
    ];


    if (!supportedLanguages.includes(language)) {
        return res.status(400).json({
            output: "Unsupported language: " + language
        });
    }


    /*
      Unique temporary working directory
    */
    const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "compiler-")
    );


    let sourceFile = "";
    let binaryFile = "";
    let command = "";
    let timeout = DEFAULT_TIMEOUT;


    /*
      PYTHON
    */
    if (language === "python") {

        sourceFile = "main.py";

        command =
            "python3 main.py";

        timeout = 30000;
    }


    /*
      JAVASCRIPT
    */
    else if (language === "javascript") {

        sourceFile = "main.js";

        command =
            "node main.js";

        timeout = 30000;
    }


    /*
      PHP
    */
    else if (language === "php") {

        sourceFile = "main.php";

        command =
            "php main.php";

        timeout = 30000;
    }


    /*
      C
    */
    else if (language === "c") {

        sourceFile = "main.c";
        binaryFile = "program";

        command =
            "gcc main.c -O2 -o program && ./program";

        timeout = 60000;
    }


    /*
      C++
    */
    else if (language === "cpp") {

        sourceFile = "main.cpp";
        binaryFile = "program";

        command =
            "g++ main.cpp -O2 -o program && ./program";

        timeout = 60000;
    }


    /*
      JAVA
    */
    else if (language === "java") {

        sourceFile = "Main.java";

        command =
            "javac Main.java && java -cp . Main";

        timeout = JAVA_TIMEOUT;
    }


    /*
      GO
    */
    else if (language === "go") {

        sourceFile = "main.go";
        binaryFile = "program";

        command =
            "go build -o program main.go && ./program";

        timeout = GO_TIMEOUT;
    }


    /*
      RUST
    */
    else if (language === "rust") {

        sourceFile = "main.rs";
        binaryFile = "program";

        command =
            "rustc main.rs -O -o program && ./program";

        timeout = RUST_TIMEOUT;
    }


    /*
      Write source code
    */
    const sourcePath = path.join(
        workDir,
        sourceFile
    );


    try {

        fs.writeFileSync(
            sourcePath,
            code,
            "utf8"
        );

    } catch (error) {

        cleanup(workDir);

        return res.status(500).json({
            output:
                "Could not create source file.\n\n" +
                error.message
        });
    }


    /*
      Environment
    */
    const environment = {
        ...process.env
    };


    /*
      Go settings
    */
    if (language === "go") {

        environment.GO111MODULE = "off";

        environment.GOCACHE =
            GO_CACHE;

        environment.GOPATH =
            GO_PATH;

        environment.GOTOOLCHAIN =
            "local";
    }


    /*
      Execute program
    */
    exec(
        command,
        {
            cwd: workDir,

            env: environment,

            timeout: timeout,

            maxBuffer:
                5 * 1024 * 1024,

            shell: "/bin/bash"
        },

        (error, stdout, stderr) => {

            let output = "";


            /*
              Error
            */
            if (error) {

                output =
                    "ERROR:\n\n";


                if (stderr &&
                    stderr.trim()) {

                    output += stderr;
                }

                else if (stdout &&
                         stdout.trim()) {

                    output += stdout;
                }

                else {

                    output +=
                        error.message ||
                        "Program execution failed.";
                }


                if (error.killed) {

                    output +=
                        "\n\nExecution stopped because the time limit was exceeded.";
                }

            }

            /*
              Success
            */
            else {

                output =
                    stdout ||
                    "Program finished successfully.";
            }


            /*
              Cleanup
            */
            cleanup(workDir);


            return res.json({
                output: output
            });
        }
    );
});


/*
  Health check
*/
app.get("/health", (req, res) => {

    res.json({
        status: "ok",
        compiler: "online"
    });
});


/*
  Start server
*/
const PORT =
    process.env.PORT || 3000;


app.listen(PORT, () => {

    console.log(
        "Online Compiler running on port " +
        PORT
    );

});
