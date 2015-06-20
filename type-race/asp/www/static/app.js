"use strict";

angular.module("type-race", [
])

    .config(function($interpolateProvider) {
        // Change the default "{{ }}" syntax to avoid confusing things with Jinja2
        $interpolateProvider.startSymbol("[[");
        $interpolateProvider.endSymbol("]]");
    })

    .controller("gameController", function($scope, dataService, UrlService, KeepAliveService,
                                           ProgressService, GameService, gameMediator) {
        $scope.userId = dataService.getStateDatum("userId");
        $scope.gameId = dataService.getStateDatum("gameId");
        $scope.urlService = new UrlService($scope.userId, $scope.gameId);
        $scope.urlService.init().then(function() {
            var gameService = new GameService($scope.userId, $scope.urlService);
            new KeepAliveService($scope.urlService).schedule();
            new ProgressService(gameService).init();

            // TODO: fake start. Move to something that sync users
            gameService.getGameText($scope.gameId).then(
                function(text) {
                    gameMediator.notify(gameMediator.GAME_START, {text: text});
                }
            );
        });
    })

    .directive("trTextTrack", function(gameMediator) {

        function controller($scope) {
            $scope.textInput = "";

            $scope.onStart = function(startEvent) {
                $scope.status = "started";
                $scope.text = startEvent.text;
                $scope.startTime = new Date();
                $scope.rightText = "";
                $scope.wrongText = "";
                $scope.otherText = $scope.text;
            };

            $scope.onFinish = function(finishEvent) {
                $scope.status = "finished";
            };

            $scope.inputUpdate = function(textInput) {
                var rightIndex = 0, wrongIndex = 0, otherIndex = 0;
                for (rightIndex = 0; rightIndex < textInput.length; rightIndex++) {
                    if (textInput[rightIndex] != $scope.text[rightIndex]) {
                        break;
                    }
                }
                $scope.rightText = textInput.substring(0, rightIndex);
                if (textInput[rightIndex] !== undefined) {
                    $scope.wrongText = $scope.text[rightIndex];
                } else {
                    $scope.wrongText = "";
                }
                $scope.otherText = $scope.text.substring(
                    ($scope.rightText + $scope.wrongText).length
                );
            };

            $scope.notifyProgress = function(rightText) {
                gameMediator.notify(gameMediator.PROGRESS, {
                    progress: $scope.rightText.length / $scope.text.length
                });
            };
        }

        function linker(scope) {
            gameMediator.register(gameMediator.GAME_START, scope.onStart);
            gameMediator.register(gameMediator.GAME_FINISH, scope.onFinish);
            scope.$watch("textInput", function(textInput, oldTextInput) {
                if (textInput === oldTextInput) return;
                scope.inputUpdate(textInput);
            });
            scope.$watch("rightText", function(rightText, oldRightText) {
                if (rightText === oldRightText) return;
                scope.notifyProgress(rightText);
            });
        }

        return {
            restrict: "A",
            scope: {},
            controller: controller,
            link: linker,
            templateUrl: "/static/partials/text-track.html"
        };
    })

    .directive("trProgressStatus", function(gameMediator) {
        function linker(scope) {
            scope.status = "started"
            gameMediator.register(gameMediator.GAME_INFO, function(gameInfo) {
                scope.player = _.find(gameInfo.players, function(player) {
                    return player.id == scope.userId;
                });
            });
            gameMediator.register(gameMediator.GAME_FINISH, function(gameInfo) {
                scope.status = "finished";
                scope.winner = gameInfo.winner;
            });
        }

        return {
            restrict: "A",
            scope: {
                userId: "@trProgressStatus"
            },
            link: linker,
            templateUrl: "/static/partials/progress-status.html"
        };
    })

    .directive("trScoreboard", function(gameMediator) {

        function linker(scope, elem, attrs) {
            gameMediator.register(gameMediator.GAME_INFO, function(gameInfo) {
                scope.players = gameInfo.players;
            });
            gameMediator.register(gameMediator.GAME_FINISH, function(gameInfo) {
                scope.players = gameInfo.players;
                scope.winner = gameInfo.winner;
            });
        }

        return {
            restrict: "A",
            scope: {
                gameId: "@trScoreboard"
            },
            link: linker,
            templateUrl: "/static/partials/scoreboard.html"
        };
    })

    .service("gameMediator", function() {
        this._observers = {};
        this.GAME_START = "gameStart";
        this.PROGRESS = "progress";
        this.GAME_INFO = "gameInfo";
        this.GAME_FINISH = "gameFinish";

        this.register = function(event, callback) {
            if (!(event in this._observers)) {
                this._observers[event] = [];
            }
            this._observers[event].push(callback);
        };

        this.notify = function(event, eventData) {
            if (!(event in this._observers)) return;
            for (var i = 0; i < this._observers[event].length; i++) {
                this._observers[event][i](eventData);
            }
        };
    })

    .factory("GameService", function($http) {
        var GameService = function(userId, urlService) {
            this._userId = userId;
            this._urlService = urlService;
        };

        GameService.prototype = {
            getGameInfo: function() {
                return $http({
                    method: "GET",
                    url: this._urlService.gameUrl(),
                }).then(function(response) { return response.data; });
            },
            updatePlayerProgress: function(progress) {
                $http({
                    method: "PATCH",
                    url: this._urlService.gameUrl(),
                    data: {user_id: this._userId, progress: progress}
                });
            },
            getGameText: function() {
                return $http({
                    method: "GET",
                    url: this._urlService.gameTextUrl()
                }).then(function(response) { return response.data; });
            }
        };

        return GameService;
    })

    .factory("ProgressService", function(gameMediator, $interval) {
        var ProgressService = function(gameService) {
            this._gameService = gameService;
        };

        ProgressService.prototype = {
            init: function() {
                gameMediator.register(gameMediator.PROGRESS, function(progressEvent) {
                    this._gameService.updatePlayerProgress(progressEvent.progress);
                }.bind(this));

                this._infoPromise = $interval(function() {
                    this._gameService.getGameInfo().then(this.gameInfoUpdate.bind(this));
                }.bind(this), 3000);
            },
            gameInfoUpdate: function(gameInfo) {
                var winner = _.find(gameInfo.players, function(player) { return player.winner });
                if (winner) {
                    $interval.cancel(this._infoPromise);
                    gameInfo.winner = winner;
                    gameMediator.notify(gameMediator.GAME_FINISH, gameInfo);
                } else {
                    gameMediator.notify(gameMediator.GAME_INFO, gameInfo);
                }
            }
        };

        return ProgressService;
    })

    .factory("UrlService", function($http) {
        var UrlService = function(userId, gameId) {
            this._userId = userId;
            this._gameId = gameId;
            this._gameLinks = {};
            this._userLinks = {};
        };

        UrlService.prototype = {
            init: function() {
                return $http({
                    method: "GET",
                    url: "/game/" + this._gameId
                }).then(function(response) {
                    var game = response.data;
                    this._gameLinks = game._links;
                    var player = _.find(game.players, function(player) {
                        return player.id == this._userId;
                    }.bind(this));
                    this._userLinks = player._links;
                }.bind(this));
            },
            keepAliveUrl: function() { return this._userLinks.user_game; },
            gameUrl: function() { return this._gameLinks.game; },
            gameTextUrl: function() { return this._gameLinks.game_text; },
            inviteUrl: function() { return this._gameLinks.invites; }
        };

        return UrlService;
    })

    .factory("KeepAliveService", function($interval, $http) {
        var KeepAliveService = function(urlService) {
            this._urlService = urlService;
        };

        function notifyAlive(keepAliveUrl) {
            $http({
                method: "POST",
                url: keepAliveUrl,
            });
        }

        KeepAliveService.prototype = {
            schedule: function() {
                this.cancel();
                var keepAliveUrl = this._urlService.keepAliveUrl();
                this._promise = $interval(function() {
                    notifyAlive(keepAliveUrl);
                }, 10000);
            },
            cancel: function() {
                if (this._promise) {
                    $interval.cancel(this._promise);
                    this._promise = null;
                }
            }
        };

        return KeepAliveService;
    })

    .service("dataService", function ($document) {
        var cache = null;

        this.getStateData = function() {
            if (cache === null) {
                var scriptElement = $document.find("#state-data");
                if (scriptElement) {
                    cache = angular.fromJson(scriptElement.html());
                }
            }
            return cache;
        };

        this.getStateDatum = function(key) { return this.getStateData()[key]; }.bind(this);
    })

;
