from app.problems.model import Problem, TestCase

_LARGE_LISTS = "\n".join(" ".join(str(n) for n in range(start, 10000, 100)) for start in range(100))
_LARGE_EXPECTED = " ".join(str(n) for n in range(10000))

PROBLEM = Problem(
    slug="merge-k-sorted-lists",
    title="Merge K Sorted Lists",
    difficulty="hard",
    tags=("heap", "divide and conquer", "linked list"),
    description=(
        "You are given `k` lists, each sorted in ascending order. Merge them into a single list sorted in ascending order.\n\n"
        "Each list stands in for a sorted linked list, so aim for a solution that merges heads rather than "
        "concatenating everything and sorting."
    ),
    input_format="Line 1: the integer `k`.\nThe next `k` lines: the values of each list, separated by spaces. An empty line is an empty list.",
    output_format="The merged values separated by spaces. Print an empty line if there are no values.",
    constraints=("0 ≤ k ≤ 10⁴", "0 ≤ lists[i].length ≤ 500", "-10⁴ ≤ lists[i][j] ≤ 10⁴", "The total number of values is at most 10⁴."),
    hints=(
        "At every step the next output value is the smallest of the current list heads.",
        "Keep the heads in a min-heap keyed by value; pop the smallest and push that list's next value.",
    ),
    expected_time="O(n log k)",
    expected_space="O(k)",
    tests=(
        TestCase("3\n1 4 5\n1 3 4\n2 6", "1 1 2 3 4 4 5 6", explanation="Merging [1,4,5], [1,3,4] and [2,6]."),
        TestCase("0", "", explanation="There are no lists, so the output is empty."),
        TestCase("1\n", "", explanation="One empty list merges into an empty list."),
        TestCase("2\n-5 0 7\n-10 -2 3 100", "-10 -5 -2 0 3 7 100", hidden=True),
        TestCase("4\n1\n1\n1\n1", "1 1 1 1", hidden=True),
        TestCase("3\n\n2\n", "2", hidden=True),
        TestCase(f"100\n{_LARGE_LISTS}", _LARGE_EXPECTED, hidden=True),
    ),
    starters={
        "python": '''import sys


def merge_k_lists(lists: list[list[int]]) -> list[int]:
    # Merge k ascending lists into one ascending list.
    return []


def main() -> None:
    lines = sys.stdin.read().split("\\n")
    k = int(lines[0])
    lists = [list(map(int, lines[i].split())) if i < len(lines) else [] for i in range(1, k + 1)]
    print(*merge_k_lists(lists))


if __name__ == "__main__":
    main()
''',
        "javascript": '''const lines = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/);

/**
 * @param {number[][]} lists
 * @return {number[]}
 */
function mergeKLists(lists) {
  // Merge k ascending lists into one ascending list.
  return [];
}

const k = Number(lines[0]);
const lists = [];
for (let i = 1; i <= k; i++) {
  lists.push((lines[i] ?? "").split(/\\s+/).filter(Boolean).map(Number));
}
console.log(mergeKLists(lists).join(" "));
''',
        "typescript": '''declare const require: any;
const { readFileSync } = require("fs");

function mergeKLists(lists: number[][]): number[] {
  // Merge k ascending lists into one ascending list.
  return [];
}

const lines = readFileSync(0, "utf8").split(/\\r?\\n/);
const k = Number(lines[0]);
const lists: number[][] = [];
for (let i = 1; i <= k; i++) {
  lists.push((lines[i] ?? "").split(/\\s+/).filter(Boolean).map(Number));
}
console.log(mergeKLists(lists).join(" "));
''',
        "java": '''import java.io.*;
import java.util.*;

public class Main {
    static List<Integer> mergeKLists(List<List<Integer>> lists) {
        // Merge k ascending lists into one ascending list.
        return new ArrayList<>();
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int k = Integer.parseInt(in.readLine().trim());
        List<List<Integer>> lists = new ArrayList<>();
        for (int i = 0; i < k; i++) {
            String line = in.readLine();
            List<Integer> list = new ArrayList<>();
            if (line != null && !line.isBlank()) {
                for (String token : line.trim().split("\\\\s+")) list.add(Integer.parseInt(token));
            }
            lists.add(list);
        }
        StringJoiner out = new StringJoiner(" ");
        for (int value : mergeKLists(lists)) out.add(String.valueOf(value));
        System.out.println(out);
    }
}
''',
        "cpp": '''#include <bits/stdc++.h>
using namespace std;

vector<int> mergeKLists(vector<vector<int>>& lists) {
    // Merge k ascending lists into one ascending list.
    return {};
}

int main() {
    string line;
    getline(cin, line);
    int k = stoi(line);
    vector<vector<int>> lists(k);
    for (int i = 0; i < k && getline(cin, line); ++i) {
        istringstream row(line);
        for (int x; row >> x;) lists[i].push_back(x);
    }
    vector<int> merged = mergeKLists(lists);
    for (size_t i = 0; i < merged.size(); ++i) cout << (i ? " " : "") << merged[i];
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

func mergeKLists(lists [][]int) []int {
	// Merge k ascending lists into one ascending list.
	return []int{}
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	scanner.Scan()
	k, _ := strconv.Atoi(strings.TrimSpace(scanner.Text()))
	lists := make([][]int, k)
	for i := 0; i < k && scanner.Scan(); i++ {
		for _, field := range strings.Fields(scanner.Text()) {
			n, _ := strconv.Atoi(field)
			lists[i] = append(lists[i], n)
		}
	}
	merged := mergeKLists(lists)
	parts := make([]string, len(merged))
	for i, v := range merged {
		parts[i] = strconv.Itoa(v)
	}
	fmt.Println(strings.Join(parts, " "))
}
''',
    },
)
