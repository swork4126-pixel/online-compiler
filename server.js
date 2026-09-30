const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

const DEFAULT_TIMEOUT = 30000;
const COMPILE_TIMEOUT = 60000;

function cleanup(dir) {
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    } catch (_) {}
}

function runProcess(command, args, options = {}) {
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
            if (!finished) {
                finished = true;
                child.kill("SIGKILL");

                resolve({
                    ok: false,
                    stdout,
                    stderr:
                        stderr ||
                        "Execution stopped: time limit exceeded.",
                    timedOut: true
                });
            }
        }, options.timeout || DEFAULT_TIMEOUT);

        child.stdout.on("data", (data) => {
            stdout += data.toString();

            if (stdout.length > 5 * 1024 * 1024) {
                child.kill("SIGKILL");
            }
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();

            if (stderr.length > 5 * 1024 * 1024) {
                child.kill("SIGKILL");
            }
        });

        child.on("error", (error) => {
            if (finished) return;

            finished = true;
            clearTimeout(timeout);

            resolve({
                ok: false,
                stdout,
                stderr: error.message,
                timedOut: false
            });
        });

        child.on("close", (code) => {
            if (finished) return;

            finished = true;
            clearTimeout(timeout);

            resolve({
                ok: code === 0,
                stdout,
                stderr,
                exitCode: code,
                timedOut: false
            });
        });

        if (options.input !== undefined) {
            child.stdin.write(options.input);
        }

        child.stdin.end();
    });
}

async function compileAndRun({
    workDir,
    compileCommand,
    compileArgs,
    runCommand,
    runArgs,
    input,
    env,
    compileTimeout = COMPILE_TIMEOUT,
    runTimeout = DEFAULT_TIMEOUT
}) {
    const compileResult = await runProcess(
        compileCommand,
        compileArgs,
        {
            cwd: workDir,
            env,
            timeout: compileTimeout
        }
    );

    if (!compileResult.ok) {
        return {
            ok: false,
            output:
                compileResult.stderr ||
                compileResult.stdout ||
                "Compilation failed."
        };
    }

    const runResult = await runProcess(
        runCommand,
        runArgs,
        {
            cwd: workDir,
            env,
            input,
            timeout: runTimeout
        }
    );

    if (!runResult.ok) {
        return {
            ok: false,
            output:
                runResult.stderr ||
                runResult.stdout ||
                "Program execution failed."
        };
    }

    return {
        ok: true,
        output:
            runResult.stdout ||
            "Program finished successfully."
    };
}

app.post("/run", async (req, res) => {
    const { code, language } = req.body;

    const input =
        typeof req.body.input === "string"
            ? req.body.input
            : "";

    if (typeof code !== "string" || code.length === 0) {
        return res.status(400).json({
            output: "Code is empty."
        });
    }

    if (!language) {
        return res.status(400).json({
            output: "Language is not selected."
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

    const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "compiler-")
    );

    let sourceFile = "";

    try {
        /*
         * PYTHON
         */
        if (language === "python") {
            sourceFile = "main.py";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await runProcess(
                "python3",
                [sourceFile],
                {
                    cwd: workDir,
                    input,
                    timeout: DEFAULT_TIMEOUT
                }
            );

            return res.json({
                output: result.ok
                    ? result.stdout || "Program finished successfully."
                    : result.stderr ||
                      result.stdout ||
                      "Python execution failed."
            });
        }

        /*
         * JAVASCRIPT
         */
        if (language === "javascript") {
            sourceFile = "main.js";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await runProcess(
                "node",
                [sourceFile],
                {
                    cwd: workDir,
                    input,
                    timeout: DEFAULT_TIMEOUT
                }
            );

            return res.json({
                output: result.ok
                    ? result.stdout || "Program finished successfully."
                    : result.stderr ||
                      result.stdout ||
                      "JavaScript execution failed."
            });
        }

        /*
         * PHP
         */
        if (language === "php") {
            sourceFile = "main.php";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await runProcess(
                "php",
                [sourceFile],
                {
                    cwd: workDir,
                    input,
                    timeout: DEFAULT_TIMEOUT
                }
            );

            return res.json({
                output: result.ok
                    ? result.stdout || "Program finished successfully."
                    : result.stderr ||
                      result.stdout ||
                      "PHP execution failed."
            });
        }

        /*
         * C
         */
        if (language === "c") {
            sourceFile = "main.c";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "gcc",
                compileArgs: [
                    sourceFile,
                    "-O2",
                    "-o",
                    "program"
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * C++
         */
        if (language === "cpp") {
            sourceFile = "main.cpp";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "g++",
                compileArgs: [
                    sourceFile,
                    "-O2",
                    "-std=c++17",
                    "-o",
                    "program"
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * JAVA
         */
        if (language === "java") {
            sourceFile = "Main.java";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "javac",
                compileArgs: [
                    sourceFile
                ],
                runCommand: "java",
                runArgs: [
                    "-cp",
                    workDir,
                    "Main"
                ],
                input,
                runTimeout: DEFAULT_TIMEOUT
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * GO
         */
        if (language === "go") {
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

            fs.mkdirSync(
                "/tmp/go-build-cache",
                { recursive: true }
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "go",
                compileArgs: [
                    "build",
                    "-o",
                    "program",
                    sourceFile
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input,
                env: goEnv,
                compileTimeout: 120000,
                runTimeout: DEFAULT_TIMEOUT
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * RUST
         */
        if (language === "rust") {
            sourceFile = "main.rs";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "rustc",
                compileArgs: [
                    sourceFile,
                    "-O",
                    "-o",
                    "program"
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input,
                compileTimeout: 120000,
                runTimeout: DEFAULT_TIMEOUT
            });

            return res.json({
                output: result.output
            });
        }

        return res.json({
            output: "Unsupported language."
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


/*
 * Health check
 */
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
});const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

const DEFAULT_TIMEOUT = 30000;
const COMPILE_TIMEOUT = 60000;

function cleanup(dir) {
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    } catch (_) {}
}

function runProcess(command, args, options = {}) {
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
            if (!finished) {
                finished = true;
                child.kill("SIGKILL");

                resolve({
                    ok: false,
                    stdout,
                    stderr:
                        stderr ||
                        "Execution stopped: time limit exceeded.",
                    timedOut: true
                });
            }
        }, options.timeout || DEFAULT_TIMEOUT);

        child.stdout.on("data", (data) => {
            stdout += data.toString();

            if (stdout.length > 5 * 1024 * 1024) {
                child.kill("SIGKILL");
            }
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();

            if (stderr.length > 5 * 1024 * 1024) {
                child.kill("SIGKILL");
            }
        });

        child.on("error", (error) => {
            if (finished) return;

            finished = true;
            clearTimeout(timeout);

            resolve({
                ok: false,
                stdout,
                stderr: error.message,
                timedOut: false
            });
        });

        child.on("close", (code) => {
            if (finished) return;

            finished = true;
            clearTimeout(timeout);

            resolve({
                ok: code === 0,
                stdout,
                stderr,
                exitCode: code,
                timedOut: false
            });
        });

        if (options.input !== undefined) {
            child.stdin.write(options.input);
        }

        child.stdin.end();
    });
}

async function compileAndRun({
    workDir,
    compileCommand,
    compileArgs,
    runCommand,
    runArgs,
    input,
    env,
    compileTimeout = COMPILE_TIMEOUT,
    runTimeout = DEFAULT_TIMEOUT
}) {
    const compileResult = await runProcess(
        compileCommand,
        compileArgs,
        {
            cwd: workDir,
            env,
            timeout: compileTimeout
        }
    );

    if (!compileResult.ok) {
        return {
            ok: false,
            output:
                compileResult.stderr ||
                compileResult.stdout ||
                "Compilation failed."
        };
    }

    const runResult = await runProcess(
        runCommand,
        runArgs,
        {
            cwd: workDir,
            env,
            input,
            timeout: runTimeout
        }
    );

    if (!runResult.ok) {
        return {
            ok: false,
            output:
                runResult.stderr ||
                runResult.stdout ||
                "Program execution failed."
        };
    }

    return {
        ok: true,
        output:
            runResult.stdout ||
            "Program finished successfully."
    };
}

app.post("/run", async (req, res) => {
    const { code, language } = req.body;

    const input =
        typeof req.body.input === "string"
            ? req.body.input
            : "";

    if (typeof code !== "string" || code.length === 0) {
        return res.status(400).json({
            output: "Code is empty."
        });
    }

    if (!language) {
        return res.status(400).json({
            output: "Language is not selected."
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

    const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "compiler-")
    );

    let sourceFile = "";

    try {
        /*
         * PYTHON
         */
        if (language === "python") {
            sourceFile = "main.py";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await runProcess(
                "python3",
                [sourceFile],
                {
                    cwd: workDir,
                    input,
                    timeout: DEFAULT_TIMEOUT
                }
            );

            return res.json({
                output: result.ok
                    ? result.stdout || "Program finished successfully."
                    : result.stderr ||
                      result.stdout ||
                      "Python execution failed."
            });
        }

        /*
         * JAVASCRIPT
         */
        if (language === "javascript") {
            sourceFile = "main.js";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await runProcess(
                "node",
                [sourceFile],
                {
                    cwd: workDir,
                    input,
                    timeout: DEFAULT_TIMEOUT
                }
            );

            return res.json({
                output: result.ok
                    ? result.stdout || "Program finished successfully."
                    : result.stderr ||
                      result.stdout ||
                      "JavaScript execution failed."
            });
        }

        /*
         * PHP
         */
        if (language === "php") {
            sourceFile = "main.php";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await runProcess(
                "php",
                [sourceFile],
                {
                    cwd: workDir,
                    input,
                    timeout: DEFAULT_TIMEOUT
                }
            );

            return res.json({
                output: result.ok
                    ? result.stdout || "Program finished successfully."
                    : result.stderr ||
                      result.stdout ||
                      "PHP execution failed."
            });
        }

        /*
         * C
         */
        if (language === "c") {
            sourceFile = "main.c";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "gcc",
                compileArgs: [
                    sourceFile,
                    "-O2",
                    "-o",
                    "program"
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * C++
         */
        if (language === "cpp") {
            sourceFile = "main.cpp";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "g++",
                compileArgs: [
                    sourceFile,
                    "-O2",
                    "-std=c++17",
                    "-o",
                    "program"
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * JAVA
         */
        if (language === "java") {
            sourceFile = "Main.java";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "javac",
                compileArgs: [
                    sourceFile
                ],
                runCommand: "java",
                runArgs: [
                    "-cp",
                    workDir,
                    "Main"
                ],
                input,
                runTimeout: DEFAULT_TIMEOUT
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * GO
         */
        if (language === "go") {
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

            fs.mkdirSync(
                "/tmp/go-build-cache",
                { recursive: true }
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "go",
                compileArgs: [
                    "build",
                    "-o",
                    "program",
                    sourceFile
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input,
                env: goEnv,
                compileTimeout: 120000,
                runTimeout: DEFAULT_TIMEOUT
            });

            return res.json({
                output: result.output
            });
        }

        /*
         * RUST
         */
        if (language === "rust") {
            sourceFile = "main.rs";

            fs.writeFileSync(
                path.join(workDir, sourceFile),
                code,
                "utf8"
            );

            const result = await compileAndRun({
                workDir,
                compileCommand: "rustc",
                compileArgs: [
                    sourceFile,
                    "-O",
                    "-o",
                    "program"
                ],
                runCommand: path.join(
                    workDir,
                    "program"
                ),
                runArgs: [],
                input,
                compileTimeout: 120000,
                runTimeout: DEFAULT_TIMEOUT
            });

            return res.json({
                output: result.output
            });
        }

        return res.json({
            output: "Unsupported language."
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


/*
 * Health check
 */
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
