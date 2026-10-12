class Solution {
public:
    ListNode* mergeTwoSorted(ListNode* a, ListNode* b) {
        ListNode dummy;
        ListNode* tail = &dummy;
        while (a && b) {
            if (b->val < a->val) { tail->next = b; b = b->next; }
            else { tail->next = a; a = a->next; }
            tail = tail->next;
        }
        tail->next = a ? a : b;
        return dummy.next;
    }
};
