const moment = require("moment");
module.exports.RouteGenerator = (function () {
  var fullMapData;
  var fullZoneData;
  var dateFormat = "YYYY-MM";
  function init(mapDataInit, zoneDataInit) {
    fullMapData = mapDataInit;
    fullZoneData = zoneDataInit;
  }
  function isEmpty(object) {
    for (var key in object) {
      if (object.hasOwnProperty(key)) {
        return false;
      }
    }
    return true;
  }

  function generateMapData(targetDate) {
    var cloneMap = JSON.parse(JSON.stringify(fullMapData));
    var cloneZone = JSON.parse(JSON.stringify(fullZoneData));
    var locations = {};
    cloneMap = _filterLocations(cloneMap, targetDate);
    cloneZone = cloneZone[targetDate];
    cloneMap.gmapsPolyfillStyles = [];
    if (!isEmpty(cloneMap.locations) || !isEmpty(cloneZone)) {
      locations = _constructTree(1, cloneMap, cloneZone);
    }

    cloneMap.locations = locations;
    return cloneMap;
  }

  function _filterLocations(mapData, targetDate) {
    var locations = mapData.locations;

    for (var nodeId in locations) {
      if (locations.hasOwnProperty(nodeId)) {
        locations[nodeId].num = Number(nodeId);
        locations[nodeId].routes = locations[nodeId].routes.filter(function (route) {
          var targetMoment = moment(targetDate, dateFormat);
          var startMoment = moment(route.startDate, dateFormat);
          route.fromId = Number(nodeId);
          return (
            targetMoment.diff(startMoment) >= 0 &&
            (route.endDate === null || targetMoment.diff(moment(route.endDate, dateFormat)) < 0)
          );
        });

        if (locations[nodeId].routes.length === 0) {
          delete locations[nodeId];
        }
      }
    }
    return mapData;
  }

  function _constructTree(startNodeId, mapData, zoneData) {
    var newLocations = {};
    var locationTypes = mapData.location_types;
    var highwayStyles = mapData.highway_styles;
    var locationData = mapData.locations;

    /**
     * A list of all terminal nodes for all zones in a given dataset
     */
    var terminalNodeList = (function getTerminalNodeList(zoneData) {
      var zoneArray = [];

      // concatenate the terminal arrays for all zones together
      for (var zoneName in zoneData) {
        if (zoneData.hasOwnProperty(zoneName)) {
          zoneArray = zoneArray.concat(zoneData[zoneName].zones);
        }
      }

      // flatten the array as the zoneArray is currently an array of arrays
      zoneArray = [].concat.apply([], zoneArray);

      // make the list unique
      zoneArray.filter(function (terminalNodeId, index, terminalArray) {
        return index === terminalArray.indexOf(terminalNodeId);
      });

      return zoneArray;
    })(zoneData);

    /**
     * Main recursive function, walks through the tree and sets various
     * attributes on the edges based on the zone properties.
     *
     * Parameters:
     *
     * fronNodeId - the Id of the node for which the current node is reached from
     * currentNodeId - the Id of the current node for which we are processing
     * zoneInfo - the object containing the known start/end state of the zone
     */
    function __walkTree(fromNodeId, currentNodeId, zoneInfo) {
      var currentNode = locationData[currentNodeId];
      var isTerminalNode = terminalNodeList.indexOf(currentNodeId) >= 0;

      // no matter what, add the current node to the new locations list
      newLocations[currentNodeId] = currentNode;

      // If the current node is a terminal node, and not the very first node,
      // then complete the zoneInfo array by pushing the current node into the
      // array.  As this array is being passed by reference, all previous
      // function calls will automatically be updated
      if (isTerminalNode && fromNodeId !== null) {
        zoneInfo.end = currentNodeId;
      }

      var toNodeId;
      var fromRoute;
      var currentRoute;
      var localZoneInfo;
      var routes = currentNode.routes;
      var routeLength = routes.length;
      // iterate through all the routes for the current node
      for (var i = 0; i < routeLength; i++) {
        currentRoute = routes[i];
        toNodeId = currentRoute.toId;

        // if the current route is where we came from, then save the route,
        // we will deffer processing the route, as we may not have the zone
        // information yet
        if (toNodeId === fromNodeId) {
          fromRoute = currentRoute;
          continue;
        }

        localZoneInfo = zoneInfo;

        // if this is a terminal node, then create a new zone object and use
        // that for traversal instead, we don't want to modify the current
        // zoneInfo as that would modify the object for all previous nodes
        // on the stack
        if (isTerminalNode && toNodeId !== currentNodeId) {
          localZoneInfo = { start: currentNodeId, end: currentNodeId };
        }

        __walkTree(currentNodeId, toNodeId, localZoneInfo);

        // Note: As this is depth first, when the code reaches this point,
        // the zoneInfo object should be populated with the full zone info
        // for this route.
        currentRoute.zone = __findZone(localZoneInfo.start, localZoneInfo.end);
        __setStyle(locationData[toNodeId], currentNode, currentRoute);
      }

      // if there is a route back to the last node, then complete the route
      // infromation here
      if (fromRoute !== undefined) {
        fromRoute.zone = __findZone(zoneInfo.start, zoneInfo.end);
      }

      return newLocations;
    }

    /**
     * Given the fromNode, toNOde, and the route, this funciton will set
     * the corresponding style to draw the route in gmapsPolyfillStyles
     */
    function __setStyle(fromNode, toNode, route) {
      var styleZone = zoneData[route.zone];
      var affiliationStyle = highwayStyles[styleZone.affiliation];

      var zoneStyle = highwayStyles[route.zone];

      // The higher number the type, the higher the priority its style takes,
      // thus we get the highest number and translate it to its text representation
      // so we can use the highwayStyles map to grab the corresponding style
      var typeId = fromNode.type > toNode.type ? fromNode.type : toNode.type;
      //var typeId = fromNode.type; // use this only east 2A change, might change it back to above. the corresponding change on 407mapdata.json is to add a new type "tempuse"
      // Bug fix: if the from or to node has type 3 (routing), the node is not a real entry/exit point (since not shown in map). The type of this route should be determined by the other node.
      if (fromNode.type === 3) {
        typeId = toNode.type;
      }
      if (toNode.type === 3) {
        typeId = fromNode.type;
      }
      // Update: if from or to node is type 6 (futurerouting), node is not a real entry/exit point (since not shown in map). The type of this route is always type 2 (planned)
      if (fromNode.type === 6 || toNode.type === 6) {
        typeId = 2;
      }
      // iterate through all keys, and set the typeName to be the key that has the
      // matching Id value
      var typeName;
      for (var typeKey in locationTypes) {
        if (locationTypes.hasOwnProperty(typeKey) && locationTypes[typeKey] === typeId) {
          typeName = typeKey;
          break;
        }
      }

      // TODO: fix style issue with routing types

      var newPolyFillObj = {
        style: {},
        path: [fromNode, toNode],
        key: fromNode.num + "-" + toNode.num,
      };

      mapData.gmapsPolyfillStyles.push(newPolyFillObj);
    }

    /**
     * Given two terminal node Id's returns the zone for which the
     * nodes represent
     */
    function __findZone(startNodeId, endNodeId) {
      var zoneDef;

      for (var zoneName in zoneData) {
        if (zoneData.hasOwnProperty(zoneName)) {
          // finter out all zones that do not contain the start/end nodeId's
          zoneDef = zoneData[zoneName].zones.filter(function (zoneDef) {
            return zoneDef.indexOf(startNodeId) >= 0 && zoneDef.indexOf(endNodeId) >= 0;
          });

          // if both nodes were found, then this is the zone that the
          // start/end nodeId's represent
          if (zoneDef.length > 0) {
            return zoneName;
          }
        }
      }

      // if we couldn't find anything then throw an error
      throw new Error("Could not find the zone corresponding to the nodes: " + startNodeId + " and " + endNodeId);
    }

    // start walking the tree, the from node is null, as the first node
    // we start on is not comming from anywhere.
    return __walkTree(null, startNodeId, { start: startNodeId });
  }

  /**
   * Given the mapdata, entry, and exit, this function will do a depth
   * first search of the graph, and return the route from the entry to
   * exit.
   *
   * Note: This function assumes that the mapData given to it has the same
   *       format (and thus filtered based on date) as the object returned
   *       from the "generateMapData" function.
   */
  function generateRoute(mapData, entryId, exitId) {
    var locationData = mapData.locations;
    var invalidRouteData = mapData.invalid_routes;

    var routeData = {
      routePaths: [],
      routePoints: [],
      hasErrors: false,
      errorMessage: "",
      errorMessage_fr: "",
    };

    /**
     * main function, gets called to kick off the route calculation
     */
    function __generateRoute() {
      __depthFirstSearch(null, entryId);

      // run this after the search has determined the route, as any
      // errors found here should override the errors during the search
      __validateRoute(entryId, exitId);

      return routeData;
    }

    /**
     * The recursive function that builds the route information from one
     * node to another
     */
    function __depthFirstSearch(fromNodeId, currentNodeId) {
      var currentNode = locationData[currentNodeId];
      var currentNodeRoutes = currentNode.routes;

      if (currentNodeId === exitId) {
        routeData.routePoints.unshift(currentNode);
        return true;
      }

      var routeLength = currentNodeRoutes.length;
      for (var i = 0; i < routeLength; i++) {
        var currentRoute = currentNodeRoutes[i];
        var toNodeId = currentRoute.toId;

        // if we are going backwards, then ignore this route
        if (toNodeId === fromNodeId) {
          continue;
        }

        // if this route has the current route, then add the node
        // to the list
        if (__depthFirstSearch(currentNodeId, toNodeId)) {
          routeData.routePaths.unshift(JSON.parse(JSON.stringify(currentRoute)));
          routeData.routePoints.unshift(currentNode);
          return true;
        }
      }

      return false;
    }

    /**
     * Does various post checks to see if the returned route is invalid or not
     */
    function __validateRoute(startNodeId, exitNodeId) {
      // check if the entry is the same as the exit, if it is, set an error
      // and return
      if (startNodeId === exitNodeId) {
        routeData.hasErrors = true;
        routeData.errorMessage = "Sorry! Please select another exit. It cannot be the same as your entry.";
        routeData.errorMessage_fr =
          "Désolé! Veuillez sélectionner une autre sortie. Vous ne pouvez pas sortir par où vous êtes entré.";
        return;
      }

      /////// validate the entry/exit points against the invalid_routes array //////
      var invalidRoutesArray = invalidRouteData;

      var invalidRoutesArray = invalidRoutesArray.filter(function (route) {
        return route.enter === startNodeId && route.exit === exitNodeId;
      });

      if (invalidRoutesArray.length !== 0) {
        routeData.hasErrors = true;
        routeData.errorMessage =
          "<b>Sorry!</b> Trips are not possible between your two selected intersections in the selected direction of travel.";
        routeData.errorMessage_fr =
          "<b>Désolé!</b> Ce voyage n'est pas possible entre les deux intersections sélectionnées dans la direction de voyage sélectionnée.";

        return;
      }

      ////////////////////// check for invalid entry ////////////////////
      var entryRoute = routeData.routePaths[0];

      if (entryRoute.enter === false) {
        routeData.hasErrors = true;
        routeData.errorMessage =
          "<b>Sorry! Please select another entrance.</b> Given the direction you are planning to travel, the entrance you have selected does not exist.";
        routeData.errorMessage_fr =
          "<b>Désolé! Veuillez sélectionner une autre entrée.</b> Vu la direction dans laquelle vous prévoyez de voyager, l’entrée que vous avez sélectionnée n'existe pas.";

        return;
      }

      ////////////////////// check for invalid exit ////////////////////
      var exitRoute = routeData.routePaths.slice(-1)[0];

      if (exitRoute.exit === false) {
        routeData.hasErrors = true;
        routeData.errorMessage =
          "<b>Sorry! Please select another exit.</b> Given the direction you are planning to travel, the exit you have selected does not exist.";
        routeData.errorMessage_fr =
          "<b>Désolé! Veuillez sélectionner une autre sortie.</b> Vu la direction dans laquelle vous prévoyez de voyager, la sortie que vous avez sélectionnée n'existe pas.";

        return;
      }
    }

    return __generateRoute();
  }

  return {
    init: init,
    generateMapData: generateMapData,
    generateRoute: generateRoute,
  };
})();
