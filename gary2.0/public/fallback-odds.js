// This provides fallback data for development and deployment testing
window.FALLBACK_DATA = {
  "sports": [
    {
      "key": "basketball_nba",
      "active": true,
      "group": "Basketball",
      "details": "NBA",
      "title": "NBA",
      "has_outrights": false
    },
    {
      "key": "baseball_mlb",
      "active": true,
      "group": "Baseball",
      "details": "MLB",
      "title": "MLB",
      "has_outrights": false
    },
    {
      "key": "icehockey_nhl",
      "active": true,
      "group": "Ice Hockey",
      "details": "NHL",
      "title": "NHL",
      "has_outrights": false
    }
  ],
  "odds": {
    "basketball_nba": [
      {
        "id": "0e97a2ab0c7b3a0825b9e9ab2b90c2a2",
        "sport_key": "basketball_nba",
        "sport_title": "NBA",
        "commence_time": "2025-04-16T00:00:00Z",
        "home_team": "Los Angeles Lakers",
        "away_team": "Boston Celtics",
        "bookmakers": [
          {
            "key": "fanduel",
            "title": "FanDuel",
            "markets": {
              "h2h": [
                {
                  "key": "h2h",
                  "outcomes": [
                    {
                      "name": "Los Angeles Lakers",
                      "price": -180
                    },
                    {
                      "name": "Boston Celtics",
                      "price": 155
                    }
                  ]
                }
              ],
              "spreads": [
                {
                  "key": "spreads",
                  "outcomes": [
                    {
                      "name": "Los Angeles Lakers",
                      "price": -110,
                      "point": -4.5
                    },
                    {
                      "name": "Boston Celtics",
                      "price": -110,
                      "point": 4.5
                    }
                  ]
                }
              ],
              "totals": [
                {
                  "key": "totals",
                  "outcomes": [
                    {
                      "name": "Over",
                      "price": -110,
                      "point": 228.5
                    },
                    {
                      "name": "Under",
                      "price": -110,
                      "point": 228.5
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    ],
    "baseball_mlb": [
      {
        "id": "7f89f9a9c5d3b1e7a5c9d3e1f9a7c5d3",
        "sport_key": "baseball_mlb",
        "sport_title": "MLB",
        "commence_time": "2025-04-16T23:00:00Z",
        "home_team": "New York Yankees",
        "away_team": "Boston Red Sox",
        "bookmakers": [
          {
            "key": "fanduel",
            "title": "FanDuel",
            "markets": {
              "h2h": [
                {
                  "key": "h2h",
                  "outcomes": [
                    {
                      "name": "New York Yankees",
                      "price": -150
                    },
                    {
                      "name": "Boston Red Sox",
                      "price": 130
                    }
                  ]
                }
              ],
              "spreads": [
                {
                  "key": "spreads",
                  "outcomes": [
                    {
                      "name": "New York Yankees",
                      "price": -110,
                      "point": -1.5
                    },
                    {
                      "name": "Boston Red Sox",
                      "price": -110,
                      "point": 1.5
                    }
                  ]
                }
              ],
              "totals": [
                {
                  "key": "totals",
                  "outcomes": [
                    {
                      "name": "Over",
                      "price": -110,
                      "point": 8.5
                    },
                    {
                      "name": "Under",
                      "price": -110,
                      "point": 8.5
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    ],
    "icehockey_nhl": [
      {
        "id": "1e3c5d7a9b1e3c5d7a9b1e3c5d7a9b1e",
        "sport_key": "icehockey_nhl",
        "sport_title": "NHL",
        "commence_time": "2025-04-16T00:30:00Z",
        "home_team": "Toronto Maple Leafs",
        "away_team": "Boston Bruins",
        "bookmakers": [
          {
            "key": "fanduel",
            "title": "FanDuel",
            "markets": {
              "h2h": [
                {
                  "key": "h2h",
                  "outcomes": [
                    {
                      "name": "Toronto Maple Leafs",
                      "price": -130
                    },
                    {
                      "name": "Boston Bruins",
                      "price": 110
                    }
                  ]
                }
              ],
              "spreads": [
                {
                  "key": "spreads",
                  "outcomes": [
                    {
                      "name": "Toronto Maple Leafs",
                      "price": -110,
                      "point": -1.5
                    },
                    {
                      "name": "Boston Bruins",
                      "price": -110,
                      "point": 1.5
                    }
                  ]
                }
              ],
              "totals": [
                {
                  "key": "totals",
                  "outcomes": [
                    {
                      "name": "Over",
                      "price": -110,
                      "point": 5.5
                    },
                    {
                      "name": "Under",
                      "price": -110,
                      "point": 5.5
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    ]
  }
};
