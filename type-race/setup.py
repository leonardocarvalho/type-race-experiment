import setuptools


setuptools.setup(
    name="type-race-experiment",
    version="1.0",
    url="http://asp.com.br",
    maintainer="Asp",
    maintainer_email="leo.rccarvalho@gmail.com",
    packages=setuptools.find_packages(),
    include_package_data=True,
    zip_safe=False,
    setup_requires=["setuptools_git==1.0b1"],
    install_requires=[
        "PasteDeploy==1.5.0",
        "PasteScript==1.7.5",
        "gevent==1.0",
        "pyramid_jinja2",
        "mock==1.0.1",
        "pyramid==1.5",
        "uwsgi==2.0.3",
        "waitress==0.8.5",
    ],
    entry_points={
        "paste.app_factory": "main = asp.app:main",
    },
)
