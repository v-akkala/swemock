class Solution:
    def isBalanced(self, s: str) -> bool:
        partner = {")": "(", "]": "[", "}": "{"}
        stack = []
        for ch in s:
            if ch in "([{":
                stack.append(ch)
            elif ch in partner:
                if not stack or stack.pop() != partner[ch]:
                    return False
        return not stack
