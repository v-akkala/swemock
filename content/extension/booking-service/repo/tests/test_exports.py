from booking.app import create_app
from booking.exports import booking_rows, parse_csv, to_csv
from conftest import at


def test_rows_and_csv_round_trip(clock):
    service, _ = create_app(clock)
    service.book("r1", "ann", at(9), at(10, 30))
    assert booking_rows(service, "r1") == [["1", "r1", "ann", "2030-06-04T09:00", "2030-06-04T10:30"]]
    text = to_csv(service, "r1")
    assert text.splitlines()[0] == "id,room,user,start,end"
    assert parse_csv(text)[0]["user"] == "ann"


def test_empty_room_has_only_a_header(clock):
    service, _ = create_app(clock)
    assert to_csv(service, "none") == "id,room,user,start,end\n"
