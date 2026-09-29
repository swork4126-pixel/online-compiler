const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();

app.use(express.json());
app.use(express.static("."));

app.post("/run", (req, res) => {
  const code = req.body.code || "";

  const file = `temp_${Date.now()}.py`;

  fs.writeFileSync(file, code);

  exec(`python ${file}`, { timeout: 5000 }, (err, stdout, stderr) => {

    fs.unlinkSync(file);

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

app.listen(process.env.PORT || 3000);
