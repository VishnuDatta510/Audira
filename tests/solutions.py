"""Reference solutions used to prove each problem's test data is correct."""

PYTHON = {
    "two-sum": '''import sys
lines = sys.stdin.read().splitlines()
nums = list(map(int, lines[0].split())); target = int(lines[1]); seen = {}
for i, n in enumerate(nums):
    if target - n in seen:
        print(seen[target - n], i); break
    seen[n] = i
''',
    "valid-parentheses": '''import sys
s = sys.stdin.readline().strip(); stack = []; pairs = {")": "(", "]": "[", "}": "{"}; ok = True
for c in s:
    if c in pairs:
        if not stack or stack.pop() != pairs[c]: ok = False; break
    else: stack.append(c)
print("true" if ok and not stack else "false")
''',
    "longest-substring-without-repeating-characters": '''import sys
s = sys.stdin.readline().rstrip("\\r\\n"); last = {}; left = best = 0
for i, c in enumerate(s):
    if last.get(c, -1) >= left: left = last[c] + 1
    last[c] = i; best = max(best, i - left + 1)
print(best)
''',
    "merge-k-sorted-lists": '''import heapq, sys
lines = sys.stdin.read().split("\\n"); k = int(lines[0])
lists = [list(map(int, lines[i].split())) if i < len(lines) else [] for i in range(1, k + 1)]
print(*heapq.merge(*lists))
''',
}

JAVASCRIPT = {
    "two-sum": '''const l = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/);
const nums = l[0].trim().split(/\\s+/).map(Number), target = Number(l[1]), seen = new Map();
for (let i = 0; i < nums.length; i++) { if (seen.has(target - nums[i])) { console.log(seen.get(target - nums[i]) + " " + i); break; } seen.set(nums[i], i); }
''',
    "valid-parentheses": '''const s = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/)[0].trim();
const st = [], p = { ")": "(", "]": "[", "}": "{" }; let ok = true;
for (const c of s) { if (p[c]) { if (st.pop() !== p[c]) { ok = false; break; } } else st.push(c); }
console.log(ok && st.length === 0 ? "true" : "false");
''',
    "longest-substring-without-repeating-characters": '''const s = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/)[0] ?? "";
const last = new Map(); let left = 0, best = 0;
for (let i = 0; i < s.length; i++) { if ((last.get(s[i]) ?? -1) >= left) left = last.get(s[i]) + 1; last.set(s[i], i); best = Math.max(best, i - left + 1); }
console.log(best);
''',
    "merge-k-sorted-lists": '''const l = require("fs").readFileSync(0, "utf8").split(/\\r?\\n/); const k = Number(l[0]); const all = [];
for (let i = 1; i <= k; i++) all.push(...(l[i] ?? "").split(/\\s+/).filter(Boolean).map(Number));
console.log(all.sort((a, b) => a - b).join(" "));
''',
}

TYPESCRIPT_TWO_SUM = '''declare const require: any;
const { readFileSync } = require("fs");
function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const j = seen.get(target - nums[i]);
    if (j !== undefined) return [j, i];
    seen.set(nums[i], i);
  }
  return [];
}
const lines = readFileSync(0, "utf8").split(/\\r?\\n/);
console.log(twoSum(lines[0].trim().split(/\\s+/).map(Number), Number(lines[1])).join(" "));
'''

JAVA_TWO_SUM = '''import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int[] nums = Arrays.stream(in.readLine().trim().split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
        int target = Integer.parseInt(in.readLine().trim());
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) { System.out.println(j + " " + i); return; }
            seen.put(nums[i], i);
        }
    }
}
'''

GO_VALID_PARENTHESES = '''package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func main() {
	line, _ := bufio.NewReader(os.Stdin).ReadString('\\n')
	s := strings.TrimSpace(line)
	pairs := map[rune]rune{')': '(', ']': '[', '}': '{'}
	var stack []rune
	for _, c := range s {
		if open, ok := pairs[c]; ok {
			if len(stack) == 0 || stack[len(stack)-1] != open {
				fmt.Println("false")
				return
			}
			stack = stack[:len(stack)-1]
		} else {
			stack = append(stack, c)
		}
	}
	fmt.Println(len(stack) == 0)
}
'''
