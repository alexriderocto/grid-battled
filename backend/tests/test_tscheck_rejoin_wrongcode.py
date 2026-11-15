"""Criterion: Rejoin and wrong code.

Rejoining with the same callsign+code restores the same square/id; a wrong code is rejected
with 401 and issues no session cookie.
"""
from tests.helpers import admin_kill, make_client, rand_name


def test_rejoin_same_code_restores_wrong_code_rejected():
    name = rand_name("tscheck-rejoin")
    with make_client() as c1:
        r1 = c1.post("/game/join", json={"username": name, "password": "555444", "player_class": "standard"})
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        player_id, x, y = body1["id"], body1["x"], body1["y"]

    with make_client() as c2:
        r2 = c2.post("/game/join", json={"username": name, "password": "555444", "player_class": "standard"})
        assert r2.status_code == 200, r2.text
        body2 = r2.json()
        assert body2["id"] == player_id
        assert (body2["x"], body2["y"]) == (x, y)

    with make_client() as c3:
        r3 = c3.post("/game/join", json={"username": name, "password": "999999", "player_class": "standard"})
        assert r3.status_code == 401, r3.text
        assert "gb_session" not in c3.cookies

    with make_client() as cleanup:
        cleanup.post("/game/join", json={"username": name, "password": "555444", "player_class": "standard"})
        admin_kill(cleanup, player_id)
