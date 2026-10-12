class Solution:
    def isBalanced(self, s: str) -> bool:
        s = "".join(c for c in s if c in "()[]{}")
        while True:
            t = s.replace("()", "").replace("[]", "").replace("{}", "")
            if t == s:
                return s == ""
            s = t
