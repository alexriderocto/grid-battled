"""Criterion: Elimination/admin kill revokes pass.

Admin kill deletes the commander and revokes every one of their login-pass sessions —
the old cookie then gets 401 on actions and null from /game/session.
"""
from tests.helpers import admin_kill, make_client, rand_name


def test_admin_kill_revokes_session():
    name = rand_name("tscheck-killrevoke")
    with make_client() as c:
        r = c.post("/game/join", json={"username": name, "password": "321321", "player_class": "standard"})
        assert r.status_code == 200, r.text
        player_id = r.json()["id"]

        r_kill = admin_kill(c, player_id)
        assert r_kill.status_code == 200, r_kill.text
        assert r_kill.json().get("ok") is True

        r_session = c.get("/game/session")
        assert r_session.status_code == 200, r_session.text
        assert r_session.json() is None

        r_expand = c.post("/game/expand", json={})
        assert r_expand.status_code == 401, r_expand.text


def test_admin_kill_requires_valid_admin_password():
    name = rand_name("tscheck-killauth")
    with make_client() as c:
        r = c.post("/game/join", json={"username": name, "password": "321999", "player_class": "standard"})
        assert r.status_code == 200, r.text
        player_id = r.json()["id"]

        r_bad = c.post("/game/admin/kill", json={"password": "000000", "target_id": player_id})
        assert r_bad.status_code == 401, r_bad.text

        admin_kill(c, player_id)
