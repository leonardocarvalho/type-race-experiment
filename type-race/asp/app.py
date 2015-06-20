import json
import pkg_resources

import pyramid.config


def main(global_config, **settings):
    settings.setdefault("jinja2.filters", "")
    settings["jinja2.filters"] += "\n".join([
        "",
        "to_json = asp.app:to_json_filter",
    ])

    config = pyramid.config.Configurator(settings=settings)
    config.registry.games = {}
    config.registry.texts = json.loads(
        pkg_resources.resource_string(__name__, "texts.json")
    )
    config.include("asp.www.home")
    config.scan("asp.www")

    return config.make_wsgi_app()


def to_json_filter(obj, **kwargs):
    rv = json.dumps(obj, **kwargs)
    rv = rv.replace('/', '\\/')
    return rv.replace('<!', '<\\u0021')
