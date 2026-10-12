class Solution {
public:
    bool isBalanced(string s) {
        string stack;
        stack.reserve(s.size());
        for (char ch : s) {
            if (ch == '(' || ch == '[' || ch == '{') {
                stack.push_back(ch);
            } else if (ch == ')' || ch == ']' || ch == '}') {
                char open = ch == ')' ? '(' : ch == ']' ? '[' : '{';
                if (stack.empty() || stack.back() != open) return false;
                stack.pop_back();
            }
        }
        return stack.empty();
    }
};
