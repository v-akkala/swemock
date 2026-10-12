class Solution:
    def mergeTwoSorted(self, a: Optional[ListNode], b: Optional[ListNode]) -> Optional[ListNode]:
        dummy = ListNode()
        tail = dummy
        while a and b:
            if b.val < a.val:
                tail.next, b = b, b.next
            else:
                tail.next, a = a, a.next
            tail = tail.next
        tail.next = a or b
        return dummy.next
