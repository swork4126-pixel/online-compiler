const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server,
    path: "/ws"
});

const TIMEOUT = {
    python: 30000,
    javascript: 30000,
    php: 30000,
    c: 60000,
    cpp: 60000,
    java: 60000,
    go: 180000,
    rust: 120000
};

const GO_CACHE = "/tmp/go-build-cache";

try {
    fs.mkdirSync(GO_CACHE, { recursive: true });
} catch (_) {}

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function cleanup(dir) {
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    } catch (_) {}
}

function killProcess(child) {
    if (!child) return;

    try {
        child.kill("SIGKILL");
    } catch (_) {}
}

function createProcess(command, args, options) {
    return spawn(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        stdio: ["pipe", "pipe", "pipe"]
    });
}

function startCompilerProcess({
    command,
    args,
    cwd,
    env,
    timeout,
    ws,
    onSuccess,
    onFailure
}) {
    const child = createProcess(command, args, {
        cwd,
        env
    });

    let finished = false;
    let stderrText = "";
    let stdoutText = "";

    const timer = setTimeout(() => {
        if (finished) return;

        finished = true;

        killProcess(child);

        send(ws, {
            type: "error",
            data: "Compilation time limit exceeded.\r\n"
        });

        onFailure();
    }, timeout);

    child.stdout.on("data", data => {
        const text = data.toString();

        stdoutText += text;

        send(ws, {
            type: "output",
            data: text
        });
    });

    child.stderr.on("data", data => {
        const text = data.toString();

        stderrText += text;

        send(ws, {
            type: "error",
            data: text
        });
    });

    child.on("error", error => {
        if (finished) return;

        finished = true;

        clearTimeout(timer);

        send(ws, {
            type: "error",
            data: error.message + "\r\n"
        });

        onFailure();
    });

    child.on("close", code => {
        if (finished) return;

        finished = true;

        clearTimeout(timer);

        if (code === 0) {
            onSuccess(child);
        } else {
            send(ws, {
                type: "error",
                data:
                    stderrText ||
                    stdoutText ||
                    `Compilation failed with exit code ${code}.\r\n`
            });

            onFailure();
        }
    });

    return child;
}

function startRunProcess({
    command,
    args,
    cwd,
    env,
    inputHandler,
    timeout,
    ws,
    onExit
}) {
    const child = createProcess(command, args, {
        cwd,
        env
    });

    let finished = false;

    const timer = setTimeout(() => {
        if (finished) return;

        finished = true;

        killProcess(child);

        send(ws, {
            type: "error",
            data:
                "\r\nExecution stopped: time limit exceeded.\r\n"
        });

        onExit();
    }, timeout);

    child.stdout.on("data", data => {
        send(ws, {
            type: "output",
            data: data.toString()
        });
    });

    child.stderr.on("data", data => {
        send(ws, {
            type: "error",
            data: data.toString()
        });
    });

    child.on("error", error => {
        if (finished) return;

        finished = true;

        clearTimeout(timer);

        send(ws, {
            type: "error",
            data: error.message + "\r\n"
        });

        onExit();
    });

    child.on("close", code => {
        if (finished) return;

        finished = true;

        clearTimeout(timer);

        send(ws, {
            type: "exit",
            code
        });

        onExit();
    });

    inputHandler(child);

    return child;
}

wss.on("connection", ws => {
    let session = null;

    send(ws, {
        type: "info",
        data: "Connected to compiler server.\r\n"
    });

    ws.on("message", async raw => {
        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch (_) {
            return;
        }

        /*
         * RUN
         */
        if (message.type === "run") {

            if (
                session &&
                session.process
            ) {
                killProcess(session.process);
            }

            if (
                session &&
                session.workDir
            ) {
                cleanup(session.workDir);
            }

            const code = message.code;
            const language = message.language;

            if (
                typeof code !== "string" ||
                !language
            ) {
                send(ws, {
                    type: "error",
                    data:
                        "Code and language are required.\r\n"
                });

                return;
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
                send(ws, {
                    type: "error",
                    data:
                        "Unsupported language: " +
                        language +
                        "\r\n"
                });

                return;
            }

            const workDir = fs.mkdtempSync(
                path.join(
                    os.tmpdir(),
                    "compiler-"
                )
            );

            session = {
                workDir,
                process: null
            };

            let sourceFile = "";
            let runCommand = "";
            let runArgs = [];
            let compileCommand = null;
            let compileArgs = [];

            if (language === "python") {
                sourceFile = "main.py";
                runCommand = "python3";
                runArgs = [sourceFile];
            }

            else if (language === "javascript") {
                sourceFile = "main.js";
                runCommand = "node";
                runArgs = [sourceFile];
            }

            else if (language === "php") {
                sourceFile = "main.php";
                runCommand = "php";
                runArgs = [sourceFile];
            }

            else if (language === "c") {
                sourceFile = "main.c";

                compileCommand = "gcc";

                compileArgs = [
                    sourceFile,
                    "-O2",
                    "-o",
                    "program"
                ];

                runCommand =
                    path.join(
                        workDir,
                        "program"
                    );
            }

            else if (language === "cpp") {
                sourceFile = "main.cpp";

                compileCommand = "g++";

                compileArgs = [
                    sourceFile,
                    "-O2",
                    "-std=c++17",
                    "-o",
                    "program"
                ];

                runCommand =
                    path.join(
                        workDir,
                        "program"
                    );
            }

            else if (language === "java") {
                sourceFile = "Main.java";

                compileCommand = "javac";

                compileArgs = [
                    sourceFile
                ];

                runCommand = "java";

                runArgs = [
                    "-cp",
                    workDir,
                    "Main"
                ];
            }

            else if (language === "go") {
                sourceFile = "main.go";

                compileCommand = "go";

                compileArgs = [
                    "build",
                    "-o",
                    "program",
                    sourceFile
                ];

                runCommand =
                    path.join(
                        workDir,
                        "program"
                    );
            }

            else if (language === "rust") {
                sourceFile = "main.rs";

                compileCommand = "rustc";

                compileArgs = [
                    sourceFile,
                    "-O",
                    "-o",
                    "program"
                ];

                runCommand =
                    path.join(
                        workDir,
                        "program"
                    );
            }

            try {
                fs.writeFileSync(
                    path.join(
                        workDir,
                        sourceFile
                    ),
                    code,
                    "utf8"
                );
            } catch (error) {
                cleanup(workDir);

                send(ws, {
                    type: "error",
                    data:
                        "File error:\r\n" +
                        error.message +
                        "\r\n"
                });

                return;
            }

            const env = {
                ...process.env
            };

            if (language === "go") {
                env.GO111MODULE = "off";
                env.GOCACHE = GO_CACHE;
            }

            send(ws, {
                type: "started",
                language
            });

            async function startProgram() {

                send(ws, {
                    type: "info",
                    data:
                        "Program started.\r\n"
                });

                const process = startRunProcess({
                    command: runCommand,
                    args: runArgs,
                    cwd: workDir,
                    env,
                    timeout:
                        TIMEOUT[
                            language
                        ],
                    ws,

                    inputHandler: child => {
                        session.process = child;
                    },

                    onExit: () => {
                        if (session) {
                            session.process = null;
                        }

                        cleanup(workDir);

                        send(ws, {
                            type: "finished"
                        });
                    }
                });

                session.process = process;
            }

            if (compileCommand) {

                send(ws, {
                    type: "info",
                    data:
                        "Compiling " +
                        language +
                        "...\r\n"
                });

                const compiler =
                    startCompilerProcess({
                        command:
                            compileCommand,

                        args:
                            compileArgs,

                        cwd:
                            workDir,

                        env,

                        timeout:
                            TIMEOUT[
                                language
                            ],

                        ws,

                        onSuccess:
                            startProgram,

                        onFailure: () => {
                            cleanup(
                                workDir
                            );

                            if (session) {
                                session.process =
                                    null;
                            }

                            send(ws, {
                                type:
                                    "finished"
                            });
                        }
                    });

                session.process =
                    compiler;

            } else {
                await startProgram();
            }

            return;
        }

        /*
         * INPUT
         */
        if (message.type === "input") {

            if (
                session &&
                session.process &&
                session.process.stdin
            ) {
                let input =
                    typeof message.data ===
                    "string"
                        ? message.data
                        : "";

                input =
                    input.replace(
                        /\r/g,
                        "\n"
                    );

                try {
                    session.process.stdin.write(
                        input
                    );
                } catch (_) {}
            }

            return;
        }

        /*
         * STOP
         */
        if (message.type === "stop") {

            if (
                session &&
                session.process
            ) {
                killProcess(
                    session.process
                );

                session.process = null;
            }

            if (
                session &&
                session.workDir
            ) {
                cleanup(
                    session.workDir
                );
            }

            send(ws, {
                type: "stopped"
            });

            return;
        }
    });

    ws.on("close", () => {

        if (
            session &&
            session.process
        ) {
            killProcess(
                session.process
            );
        }

        if (
            session &&
            session.workDir
        ) {
            cleanup(
                session.workDir
            );
        }
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        compiler: "online",
        websocket: true
    });
});

const PORT =
    process.env.PORT || 10000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "Online Compiler running on port " +
            PORT
        );
    }
);
