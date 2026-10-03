from app.problems.model import Problem, TestCase

PROBLEM = Problem(
    slug="valid-parentheses",
    title="Valid Parentheses",
    difficulty="easy",
    tags=("string", "stack"),
    description=(
        "Given a string `s` containing only the characters `(`, `)`, `{`, `}`, `[` and `]`, decide whether it is valid.\n\n"
        "A string is valid when:\n\n"
        "1. Every open bracket is closed by the same type of bracket.\n"
        "2. Open brackets are closed in the correct order.\n"
        "3. Every close bracket has a matching open bracket."
    ),
    input_format="A single line containing `s`.",
    output_format="`true` if the string is valid, otherwise `false`.",
    constraints=("1 ≤ s.length ≤ 10⁴", "s contains only the characters ()[]{}"),
    hints=(
        "The most recent unmatched open bracket must be the first one closed.",
        "Push open brackets onto a stack; on a close bracket, the top of the stack must match.",
    ),
    expected_time="O(n)",
    expected_space="O(n)",
    tests=(
        TestCase("()", "true"),
        TestCase("()[]{}", "true", explanation="Each pair opens and closes in order."),
        TestCase("(]", "false", explanation="'(' is closed by ']', which is a different type."),
        TestCase("([)]", "false", hidden=True),
        TestCase("{[]}", "true", hidden=True),
        TestCase("(", "false", hidden=True),
        TestCase(")(", "false", hidden=True),
        TestCase("{[()()]}", "true", hidden=True),
        TestCase("(" * 5000 + ")" * 5000, "true", hidden=True),
    ),
    starters={
        "python": '''import sys


def is_valid(s: str) -> bool:
    # Return True if every bracket is closed in the correct order.
    return False


def main() -> None:
    s = sys.stdin.readline().strip()
    print("true" if is_valid(s) else "false")


if __name__ == "__main__":
    main()
''',
        "javascript": '''const s = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/)[0].trim();

/**
 * @param {string} s
 * @return {boolean}
 */
function isValid(s) {
  // Return true if every bracket is closed in the correct order.
  return false;
}

console.log(isValid(s) ? "true" : "false");
''',
        "typescript": '''declare const require: any;
const { readFileSync } = require("fs");

function isValid(s: string): boolean {
  // Return true if every bracket is closed in the correct order.
  return false;
}

const s = readFileSync(0, "utf8").split(/\\r?\\n/)[0].trim();
console.log(isValid(s) ? "true" : "false");
''',
        "java": '''import java.io.*;
import java.util.*;

public class Main {
    static boolean isValid(String s) {
        // Return true if every bracket is closed in the correct order.
        return false;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String s = in.readLine();
        System.out.println(isValid(s == null ? "" : s.trim()) ? "true" : "false");
    }
}
''',
        "cpp": '''#include <bits/stdc++.h>
using namespace std;

bool isValid(const string& s) {
    // Return true if every bracket is closed in the correct order.
    return false;
}

int main() {
    string s;
    getline(cin, s);
    if (!s.empty() && s.back() == '\\r') s.pop_back();
    cout << (isValid(s) ? "true" : "false") << "\\n";
}
''',
        "go": '''package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func isValid(s string) bool {
	// Return true if every bracket is closed in the correct order.
	return false
}

func main() {
	line, _ := bufio.NewReader(os.Stdin).ReadString('\\n')
	if isValid(strings.TrimSpace(line)) {
		fmt.Println("true")
	} else {
		fmt.Println("false")
	}
}
''',
    },
)
