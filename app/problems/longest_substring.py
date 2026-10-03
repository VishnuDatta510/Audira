from app.problems.model import Problem, TestCase

PROBLEM = Problem(
    slug="longest-substring-without-repeating-characters",
    title="Longest Substring Without Repeating Characters",
    difficulty="medium",
    tags=("string", "sliding window", "hash map"),
    description=(
        "Given a string `s`, find the length of the longest substring that contains no repeated characters.\n\n"
        "A substring is a contiguous run of characters inside the string."
    ),
    input_format="A single line containing `s`. The line may be empty.",
    output_format="A single integer: the length of the longest substring without repeating characters.",
    constraints=("0 ≤ s.length ≤ 5 · 10⁴", "s consists of English letters, digits and symbols (no spaces)."),
    hints=(
        "Keep a window [left, right] that never contains a duplicate.",
        "Remember the last index of each character so the left edge can jump forward in one step.",
    ),
    expected_time="O(n)",
    expected_space="O(min(n, alphabet))",
    tests=(
        TestCase("abcabcbb", "3", explanation='The answer is "abc", with length 3.'),
        TestCase("bbbbb", "1", explanation='The answer is "b", with length 1.'),
        TestCase("pwwkew", "3", explanation='The answer is "wke". "pwke" is a subsequence, not a substring.'),
        TestCase("", "0", hidden=True),
        TestCase("dvdf", "3", hidden=True),
        TestCase("abba", "2", hidden=True),
        TestCase("tmmzuxt", "5", hidden=True),
        TestCase("au", "2", hidden=True),
        TestCase("abcdefghijklmnopqrstuvwxyz" * 2000, "26", hidden=True),
    ),
    starters={
        "python": '''import sys


def length_of_longest_substring(s: str) -> int:
    # Return the length of the longest substring without repeating characters.
    return 0


def main() -> None:
    s = sys.stdin.readline().rstrip("\\r\\n")
    print(length_of_longest_substring(s))


if __name__ == "__main__":
    main()
''',
        "javascript": '''const s = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/)[0] ?? "";

/**
 * @param {string} s
 * @return {number}
 */
function lengthOfLongestSubstring(s) {
  // Return the length of the longest substring without repeating characters.
  return 0;
}

console.log(lengthOfLongestSubstring(s));
''',
        "typescript": '''declare const require: any;
const { readFileSync } = require("fs");

function lengthOfLongestSubstring(s: string): number {
  // Return the length of the longest substring without repeating characters.
  return 0;
}

const s = readFileSync(0, "utf8").split(/\\r?\\n/)[0] ?? "";
console.log(lengthOfLongestSubstring(s));
''',
        "java": '''import java.io.*;
import java.util.*;

public class Main {
    static int lengthOfLongestSubstring(String s) {
        // Return the length of the longest substring without repeating characters.
        return 0;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String s = in.readLine();
        System.out.println(lengthOfLongestSubstring(s == null ? "" : s));
    }
}
''',
        "cpp": '''#include <bits/stdc++.h>
using namespace std;

int lengthOfLongestSubstring(const string& s) {
    // Return the length of the longest substring without repeating characters.
    return 0;
}

int main() {
    string s;
    getline(cin, s);
    if (!s.empty() && s.back() == '\\r') s.pop_back();
    cout << lengthOfLongestSubstring(s) << "\\n";
}
''',
        "go": '''package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func lengthOfLongestSubstring(s string) int {
	// Return the length of the longest substring without repeating characters.
	return 0
}

func main() {
	line, _ := bufio.NewReader(os.Stdin).ReadString('\\n')
	fmt.Println(lengthOfLongestSubstring(strings.TrimRight(line, "\\r\\n")))
}
''',
    },
)
