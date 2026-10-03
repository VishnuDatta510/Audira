"""Language catalog shared by the editor (Monaco ids) and the runners.

`judge0_id` is the language id on Judge0 CE (GET {JUDGE0_URL}/languages).
`compile` and `run` are templates for the offline local runner (CODE_RUNNER=local);
`{dir}`, `{file}` and `{python}` are substituted at run time.
"""
from __future__ import annotations

import shutil
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    id: str
    label: str
    monaco: str
    file_name: str
    judge0_id: int
    run: tuple[str, ...] | None = None
    compile: tuple[str, ...] | None = None
    time_multiplier: float = 1.0
    generic_template: str = ""
    judge0_compiler_options: str | None = None

    def local_tools(self) -> list[str]:
        return [cmd[0] for cmd in (self.compile, self.run) if cmd and not cmd[0].startswith("{")]

    def local_available(self) -> bool:
        if self.run is None:
            return False
        return all(shutil.which(tool) for tool in self.local_tools())


_PARSE = "Parse the input described in the problem statement and print the answer."

LANGUAGES: dict[str, Language] = {
    lang.id: lang
    for lang in (
        Language("python", "Python 3", "python", "main.py", 109, run=("{python}", "{file}"),
                 generic_template=f"import sys\n\nlines = sys.stdin.read().splitlines()\n# {_PARSE}\n"),
        Language("javascript", "JavaScript (Node.js)", "javascript", "main.js", 102, run=("node", "{file}"),
                 generic_template=f'const lines = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/);\n// {_PARSE}\n'),
        Language("typescript", "TypeScript", "typescript", "main.ts", 101, run=("node", "--no-warnings", "{file}"),
                 judge0_compiler_options="--target es2020",
                 generic_template=f'declare const require: any;\nconst {{ readFileSync }} = require("fs");\n\nconst lines = readFileSync(0, "utf8").split(/\\r?\\n/);\n// {_PARSE}\n'),
        Language("java", "Java", "java", "Main.java", 91,
                 compile=("javac", "-encoding", "UTF-8", "{file}"), run=("java", "-Xss64m", "-cp", "{dir}", "Main"), time_multiplier=2.0,
                 generic_template=f"import java.io.*;\nimport java.util.*;\n\npublic class Main {{\n    public static void main(String[] args) throws IOException {{\n        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));\n        // {_PARSE}\n    }}\n}}\n"),
        Language("cpp", "C++ 17", "cpp", "main.cpp", 105,
                 compile=("g++", "-O2", "-std=c++17", "-o", "{dir}/main", "{file}"), run=("{dir}/main",),
                 generic_template=f"#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {{\n    // {_PARSE}\n    return 0;\n}}\n"),
        Language("go", "Go", "go", "main.go", 107,
                 compile=("go", "build", "-o", "{dir}/main.exe", "{file}"), run=("{dir}/main.exe",), time_multiplier=1.5,
                 generic_template=f'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {{\n\treader := bufio.NewReader(os.Stdin)\n\t// {_PARSE}\n\t_ = reader\n\tfmt.Println()\n}}\n'),
        Language("c", "C", "c", "main.c", 103,
                 compile=("gcc", "-O2", "-o", "{dir}/main", "{file}"), run=("{dir}/main",),
                 generic_template=f"#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main(void) {{\n    // {_PARSE}\n    return 0;\n}}\n"),
        Language("csharp", "C#", "csharp", "Main.cs", 51,
                 generic_template=f"using System;\nusing System.Linq;\n\npublic class Program\n{{\n    public static void Main()\n    {{\n        string[] lines = Console.In.ReadToEnd().Split('\\n');\n        // {_PARSE}\n    }}\n}}\n"),
        Language("rust", "Rust", "rust", "main.rs", 108,
                 compile=("rustc", "-O", "-o", "{dir}/main", "{file}"), run=("{dir}/main",),
                 generic_template=f"use std::io::{{self, Read}};\n\nfn main() {{\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // {_PARSE}\n}}\n"),
        Language("kotlin", "Kotlin", "kotlin", "Main.kt", 111, time_multiplier=2.0,
                 generic_template=f"fun main() {{\n    val lines = generateSequence(::readLine).toList()\n    // {_PARSE}\n}}\n"),
        Language("ruby", "Ruby", "ruby", "main.rb", 72, run=("ruby", "{file}"),
                 generic_template=f'lines = $stdin.read.split("\\n")\n# {_PARSE}\n'),
        Language("php", "PHP", "php", "main.php", 98, run=("php", "{file}"),
                 generic_template=f'<?php\n$lines = explode("\\n", stream_get_contents(STDIN));\n// {_PARSE}\n'),
        Language("swift", "Swift", "swift", "main.swift", 83,
                 generic_template=f"var lines: [String] = []\nwhile let line = readLine() {{ lines.append(line) }}\n// {_PARSE}\n"),
    )
}


def get_language(language_id: str) -> Language | None:
    return LANGUAGES.get(language_id)


def python_executable() -> str:
    return sys.executable
