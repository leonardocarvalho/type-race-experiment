import logging
import random
import string
import datetime

import pyramid.view
import pyramid.httpexceptions
import pyramid.events


def includeme(config):
    config.include("pyramid_jinja2")
    config.add_jinja2_search_path("asp.www:templates")
    config.add_static_view(name="static", path="asp.www:static")

    config.add_route("home", pattern="/")
    config.add_route("enter_game", pattern="/game/{game_id}/enter")
    config.add_route("game", pattern="/game/{game_id}")
    config.add_route("user_game", pattern="/game/{game_id}/user/{user_id}")
    config.add_route("game_text", pattern="/game/{game_id}/text")


@pyramid.view.view_config(
    route_name="home",
    request_method="GET",
)
def home(request):
    game_id = random_string()
    while game_id in request.registry.games:
        game_id = random_string()

    game = {
        "id": game_id,
        "players": {},
        "text_id": random.choice(request.registry.texts.keys()),
        "admin": None,
        "_links": {
            "invites": request.route_url("enter_game", game_id=game_id, _external=True),
            "game": request.route_url("game", game_id=game_id),
            "game_text": request.route_url("game_text", game_id=game_id),
        }
    }

    user_id = add_user_to_game(game, request)
    game["admin"] = user_id

    request.registry.games[game_id] = game
    return pyramid.httpexceptions.HTTPFound(
        location=request.route_url("user_game", game_id=game_id, user_id=user_id)
    )


@pyramid.view.view_config(
    route_name="enter_game",
    request_method="GET",
)
def enter_game(request):
    try:
        game_id = request.matchdict["game_id"]
        game = request.registry.games[game_id]
    except KeyError:
        raise pyramid.httpexceptions.HTTPNotFound()

    user_id = add_user_to_game(game, request)
    return pyramid.httpexceptions.HTTPFound(
        location=request.route_url("user_game", game_id=game_id, user_id=user_id)
    )


@pyramid.view.view_config(
    route_name="game",
    renderer="json",
    request_method="GET",
)
def game(request):
    try:
        game = request.registry.games[request.matchdict["game_id"]]
    except KeyError:
        return pyramid.httpexceptions.HTTPNotFound(json_body={"error": "no such game"})
    return {
        "players": {
            player_id: {
                "name": player["name"],
                "progress": player["progress"],
                "id": player["id"],
                "winner": player.get("winner"),
                "_links": player["_links"],
            }
            for player_id, player in game["players"].items()
        },
        "_links": game["_links"],
    }

@pyramid.view.view_config(
    route_name="game",
    request_method="PATCH",
)
def game_update(request):
    changes = request.json_body
    try:
        game = request.registry.games[request.matchdict["game_id"]]
        assert changes["user_id"] in game["players"]
        player = game["players"][changes["user_id"]]
        progress = float(changes["progress"])
        assert progress <= 1
    except (KeyError, ValueError, AssertionError):
        logging.exception("Bad game update")
        raise pyramid.httpexceptions.HTTPBadRequest()
    player["progress"] = progress
    if progress == 1 and all(not p.get("winner") for p in game["players"].values()):
        player["winner"] = True
    return pyramid.httpexceptions.HTTPNoContent()


@pyramid.view.view_config(
    route_name="user_game",
    renderer="game.jinja2",
    request_method="GET",
)
def user_game(request):
    return {
        "game_id": request.matchdict["game_id"],
        "user_id": request.matchdict["user_id"],
    }


@pyramid.view.view_config(
    route_name="user_game",
    request_method="POST",
)
def keep_user_alive(request):
    try:
        game = request.registry.games[request.matchdict["game_id"]]
        player = game["players"][request.matchdict["user_id"]]
        player["last_ping"] = datetime.datetime.utcnow()
    except KeyError:
        logging.exception("Fail to keep user alive")
        raise pyramid.httpexceptions.HTTPBadRequest()
    return pyramid.httpexceptions.HTTPNoContent()


@pyramid.view.view_config(
    route_name="game_text",
    renderer="string",
    request_method="GET",
)
def game_text(request):
    try:
        game = request.registry.games[request.matchdict["game_id"]]
    except KeyError:
        raise pyramid.httpexceptions.HTTPNotFound()
    return request.registry.texts[game["text_id"]]


@pyramid.events.subscriber(pyramid.events.NewRequest)
def expire_users(event):

    def expired(time):
        return datetime.datetime.utcnow() - time > datetime.timedelta(seconds=30)

    games = event.request.registry.games
    for game_info in games.values():
        game_info["players"] = {
            user_id: user_info
            for user_id, user_info in game_info["players"].items()
            if not expired(user_info["last_ping"])
        }

    event.request.registry.games = {
        game_id: game_info
        for game_id, game_info in games.items()
        if len(game_info["players"]) > 0
    }


def random_string(size=10, charset=string.letters + string.digits):
    return "".join(random.choice(charset) for _ in xrange(size))


def add_user_to_game(game, request):

    NAMES = ["Batta", "Oda", "Zoio", "Asp", "Sassaki", "BT", "Mauro", "Sherman", "Dual", "Baron",
             "Nic", "Kurka", "Camila", "Murilo", "Julio", "Danilo"]

    def user_name(game):
        game_names = {player["name"] for player in game["players"].values()}
        available_names = [n for n in NAMES if n not in game_names]
        return random.choice(available_names)

    user_id = random_string()
    while user_id in game["players"]:
        user_id = random_string()

    player = {
        "name": user_name(game),
        "progress": 0,
        "id": user_id,
        "last_ping": datetime.datetime.utcnow(),
        "_links": {
            "user_game": request.route_url("user_game", game_id=game["id"], user_id=user_id),
        }
    }
    game["players"][user_id] = player
    return user_id
