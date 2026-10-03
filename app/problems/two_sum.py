from app.problems.model import Problem, TestCase

_LARGE_NUMS = " ".join(str(n) for n in range(1, 10001))

PROBLEM = Problem(
    slug="two-sum",
    title="Two Sum",
    difficulty="easy",
    tags=("array", "hash map"),
    description=(
        "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers "
        "that add up to `target`.\n\n"
        "Each input has exactly one solution, and you may not use the same element twice."
    ),
    input_format="Line 1: the integers of `nums`, separated by spaces.\nLine 2: the integer `target`.",
    output_format="The two indices in ascending order, separated by a space.",
    constraints=("2 ≤ nums.length ≤ 10⁴", "-10⁹ ≤ nums[i] ≤ 10⁹", "-10⁹ ≤ target ≤ 10⁹", "Exactly one valid answer exists."),
    hints=(
        "A brute-force pair check is O(n²). Can you remember what you have already seen?",
        "Store each value's index in a hash map and look up target − value as you scan.",
    ),
    expected_time="O(n)",
    expected_space="O(n)",
    tests=(
        TestCase("2 7 11 15\n9", "0 1", explanation="nums[0] + nums[1] = 2 + 7 = 9."),
        TestCase("3 2 4\n6", "1 2", explanation="nums[1] + nums[2] = 2 + 4 = 6."),
        TestCase("3 3\n6", "0 1"),
        TestCase("1 5 3 8 2\n10", "3 4", hidden=True),
        TestCase("-3 4 3 90\n0", "0 2", hidden=True),
        TestCase("0 4 3 0\n0", "0 3", hidden=True),
        TestCase(f"{_LARGE_NUMS}\n19999", "9998 9999", hidden=True),
    ),
    starters={
        "python": '''import sys


def two_sum(nums: list[int], target: int) -> list[int]:
    # Return the indices of the two numbers that add up to target.
    return []


def main() -> None:
    lines = sys.stdin.read().splitlines()
    nums = list(map(int, lines[0].split()))
    target = int(lines[1])
    print(*two_sum(nums, target))


if __name__ == "__main__":
    main()
''',
        "javascript": '''const lines = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/);

/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
function twoSum(nums, target) {
  // Return the indices of the two numbers that add up to target.
  return [];
}

const nums = lines[0].trim().split(/\\s+/).map(Number);
const target = Number(lines[1]);
console.log(twoSum(nums, target).join(" "));
''',
        "typescript": '''declare const require: any;
const { readFileSync } = require("fs");

function twoSum(nums: number[], target: number): number[] {
  // Return the indices of the two numbers that add up to target.
  return [];
}

const lines = readFileSync(0, "utf8").split(/\\r?\\n/);
const nums = lines[0].trim().split(/\\s+/).map(Number);
const target = Number(lines[1]);
console.log(twoSum(nums, target).join(" "));
''',
        "java": '''import java.io.*;
import java.util.*;

public class Main {
    static int[] twoSum(int[] nums, int target) {
        // Return the indices of the two numbers that add up to target.
        return new int[0];
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int[] nums = Arrays.stream(in.readLine().trim().split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
        int target = Integer.parseInt(in.readLine().trim());
        StringJoiner out = new StringJoiner(" ");
        for (int index : twoSum(nums, target)) out.add(String.valueOf(index));
        System.out.println(out);
    }
}
''',
        "cpp": '''#include <bits/stdc++.h>
using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    // Return the indices of the two numbers that add up to target.
    return {};
}

int main() {
    string line;
    getline(cin, line);
    istringstream row(line);
    vector<int> nums;
    for (int x; row >> x;) nums.push_back(x);
    int target;
    cin >> target;
    vector<int> answer = twoSum(nums, target);
    for (size_t i = 0; i < answer.size(); ++i) cout << (i ? " " : "") << answer[i];
    cout << "\\n";
}
''',
        "go": '''package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

func twoSum(nums []int, target int) []int {
	// Return the indices of the two numbers that add up to target.
	return []int{}
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	first, _ := reader.ReadString('\\n')
	second, _ := reader.ReadString('\\n')
	var nums []int
	for _, field := range strings.Fields(first) {
		n, _ := strconv.Atoi(field)
		nums = append(nums, n)
	}
	target, _ := strconv.Atoi(strings.TrimSpace(second))
	answer := twoSum(nums, target)
	parts := make([]string, len(answer))
	for i, v := range answer {
		parts[i] = strconv.Itoa(v)
	}
	fmt.Println(strings.Join(parts, " "))
}
''',
    },
)
