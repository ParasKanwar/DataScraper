const path = require("path");
const fs = require("fs");

fs.appendFileSync(path.join(__dirname, "./data.csv"), "hello,world\n");
