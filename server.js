const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

const TIMEOUTS = {
    python: 30000,
    javascript: 30000,
    php: 30000,
    c: 60000,
    cpp: 60000,
    java: 60000,
    go: 180000,
    rust: 120000
};

function cleanup(dir) {
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    } catch (_) {}
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env || process.env,
            stdio: ["pipe", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let finished = false;

        const timeout = setTimeout(() => {
            if (finished) return;

            finished = true;

            try {
                child.kill("SIGKILL");
            } catch (_) {}

            resolve({
                code: -1,
                stdout,
                stderr: "Execution time limit exceeded.",
                timeout: true
            });
        }, options.timeout || 30000);

        child.stdout.on("data", (data) => {
            stdout += data.toString();

            if (stdout.length > 5 * 1024 * 1024) {
                try {
                    child.kill("SIGKILL");
                } catch (_) {}
            }
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();

            if (stderr.length > 5 * 1024 * 1024) {
                try {
                    child.kill("SIGKILL");
                } catch (_) {}
            }
        });

        child.on("error", (error) => {
            if (finished) return;

            finished = true;
            clearTimeout(timeout);

            resolve({
                code: -1,
                stdout,
                stderr: error.message,
                timeout: false
            });
        });

        child.on("close", (code) => {
            if (finished) return;

            finished = true;
            clearTimeout(timeout);

            resolve({
                code,
                stdout,
                stderr,
                timeout: false
            });
        });

        if (typeof options.input === "string") {
            child.stdin.write(options.input);
        }

        child.stdin.end();
    });
}

async function executeProgram({
    workDir,
    command,
    args,
    input,
    env,
    timeout
}) {
    return runCommand(command, args, {
        cwd: workDir,
        input,
        env,
        timeout
    });
}

async function compileAndRun({
    workDir,
    compiler,
    compilerArgs,
    runner,
    runnerArgs,
    input,
    env,
    compileTimeout,
    runTimeout
}) {
    const compileResult = await runCommand(
        compiler,
        compilerArgs,
        {
            cwd: workDir,
            env,
            timeout: compileTimeout
        }
    );

    if (compileResult.code !== 0) {
        return {
            success: false,
            output:
                compileResult.stderr ||
                compileResult.stdout ||
                "Compilation failed."
        };
    }

    const runResult = await runCommand(
        runner,
        runnerArgs,
        {
            cwd: workDir,
            env,
            input,
            timeout: runTimeout
        }
    );

    if (runResult.code !== 0) {
        return {
            success: false,
            output:
                runResult.stderr ||
                runResult.stdout ||
                "Program execution failed."
        };
    }

    return {
        success: true,
        output:
            runResult.stdout ||
            "Program finished successfully."
    };
}

app.post("/run", async (req, res) => {
    const code = req.body?.code;
    const language = req.body?.language;
    const input =
        typeof req.body?.input === "string"
            ? req.body.input
            : "";

    if (typeof code !== "string" || code.trim() === "") {
        return res.status(400).json({
            output: "Code is empty."
        });
    }

    if (!language) {
        return res.status(400).json({
            output: "Please select a language."
        });
    }

    const supported = [
        "python",
        "javascript",
        "php",
        "c",
        "cpp",
        "java",
        "go",
        "rust"
    ];

    if (!supported.includes(language)) {
        return res.status(400).json({
            output: "Unsupported language: " + language
        });
    }

    const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "compiler-")
    );

    try {
        let sourceFile;
        let result;

        if (language === "python") {
            sourceFile = "main.py";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            result = await executeProgram({
                workDir,
                command: "python3",
                args: [sourceFile],
                input,
                timeout: TIMEOUTS.python
            });
        }

        else if (language === "javascript") {
            sourceFile = "main.js";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            result = await executeProgram({
                workDir,
                command: "node",
                args: [sourceFile],
                input,
                timeout: TIMEOUTS.javascript
            });
        }

        else if (language === "php") {
            sourceFile = "main.php";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            result = await executeProgram({
                workDir,
                command: "php",
                args: [sourceFile],
                input,
                timeout: TIMEOUTS.php
            });
        }

        else if (language === "c") {
            sourceFile = "main.c";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            result = await compileAndRun({
                workDir,
                compiler: "gcc",
                compilerArgs: [
                    sourceFile,
                    "-O2",
                    "-o",
                    "program"
                ],
                runner: path.join(workDir, "program"),
                runnerArgs: [],
                input,
                compileTimeout: TIMEOUTS.c,
                runTimeout: TIMEOUTS.c
            });
        }

        else if (language === "cpp") {
            sourceFile = "main.cpp";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            result = await compileAndRun({
                workDir,
                compiler: "g++",
                compilerArgs: [
                    sourceFile,
                    "-O2",
                    "-std=c++17",
                    "-o",
                    "program"
                ],
                runner: path.join(workDir, "program"),
                runnerArgs: [],
                input,
                compileTimeout: TIMEOUTS.cpp,
                runTimeout: TIMEOUTS.cpp
            });
        }

        else if (language === "java") {
            sourceFile = "Main.java";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            result = await compileAndRun({
                workDir,
                compiler: "javac",
                compilerArgs: [
                    sourceFile
                ],
                runner: "java",
                runnerArgs: [
                    "-cp",
                    workDir,
                    "Main"
                ],
                input,
                compileTimeout: TIMEOUTS.java,
                runTimeout: TIMEOUTS.java
            });
        }

        else if (language === "go") {
            sourceFile = "main.go";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const goEnv = {
                ...process.env,
                GO111MODULE: "off",
                GOCACHE: "/tmp/go-build-cache"
            };

            try {
                fs.mkdirSync(
                    "/tmp/go-build-cache",
                    { recursive: true }
                );
            } catch (_) {}

            result = await compileAndRun({
                workDir,
                compiler: "go",
                compilerArgs: [
                    "build",
                    "-o",
                    "program",
                    sourceFile
                ],
                runner: path.join(workDir, "program"),
                runnerArgs: [],
                input,
                env: goEnv,
                compileTimeout: TIMEOUTS.go,
                runTimeout: 30000
            });
        }

        else if (language === "rust") {
            sourceFile = "main.rs";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            result = await compileAndRun({
                workDir,
                compiler: "rustc",
                compilerArgs: [
                    sourceFile,
                    "-O",
                    "-o",
                    "program"
                ],
                runner: path.join(workDir, "program"),
                runnerArgs: [],
                input,
                compileTimeout: TIMEOUTS.rust,
                runTimeout: 30000
            });
        }

        if (!result) {
            return res.json({
                output: "Execution failed."
            });
        }

        return res.json({
            output: result.output
        });

    } catch (error) {
        return res.status(500).json({
            output:
                "SERVER ERROR:\n\n" +
                error.message
        });

    } finally {
        cleanup(workDir);
    }
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        compiler: "online",
        languages: [
            "Python",
            "JavaScript",
            "PHP",
            "C",
            "C++",
            "Java",
            "Go",
            "Rust"
        ]
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        "Online Compiler running on port " + PORT
    );
});
