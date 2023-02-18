module.exports = class TollCalculator {
  rateData;
  zoneData;
  constructor(rateDataInit, zoneDataInit) {
    this.rateData = rateDataInit;
    this.zoneData = zoneDataInit;
  }
  calculate(date, map, routeObj, vehicleType, rateType) {
    var rates = this.rateData.rates[date];
    var zones = this.zoneData.zones[date];
    var locations = map.locations;
    var affiliationsArray = [];
    var route = routeObj.routePaths;
    var charges = {
      zoneCharges: [],
      affiliationCharges: {},
      cameraCharge: [0, 0],
      tripTollCharge: [0, 0],
      costPerKm: 0,
      totalToll: [0, 0],
      totalAmount: [0, 0],
      totalDistance: 0,
    };
    // internal function used to return an array where both input arrays are summed together
    function _sumArrayValues(array1, array2) {
      var arrayLength = array1.length;
      if (arrayLength !== array2.length) {
        throw new error("Arrays " + array1 + "and " + array2 + "have different lengths");
      }

      var sumArray = [];
      for (var i = 0; i < arrayLength; i++) {
        sumArray[i] = array1[i] + array2[i];
      }

      return sumArray;
    }

    // function used to create a new zoneCharge object, and do all the related initializations
    function _createNewZoneCharges(route, zone, isLeft) {
      var currentAffiliation = zone.affiliation;

      // only add the affiliation if it doesn't already exist in the array
      if (affiliationsArray.indexOf(currentAffiliation) < 0) {
        affiliationsArray.push(currentAffiliation);
      }

      // create a new affiliationCharges object if it doesn't already exist for the affiliation
      charges.affiliationCharges[currentAffiliation] =
        charges.affiliationCharges[currentAffiliation] || _createNewAffiliationCharges(currentAffiliation);

      var rateAmount = null;
      var direction = isLeft ? "westbound" : "eastbound";
      var hasDirection = rates[vehicleType][direction] != null && rates[vehicleType][direction][currentAffiliation] != null;

      if (hasDirection) {
        rateAmount = rates[vehicleType][direction][currentAffiliation][zone.zone_rate][rateType];
      } else {
        rateAmount = rates[vehicleType][currentAffiliation][zone.zone_rate + "_" + rateType];
      }

      return {
        name: zone.name,
        entry: locations[route.fromId].name,
        exit: "",
        affiliation: zone.affiliation,
        image: zone.image,
        rate: rateAmount,
        zone: zone.zone_rate,

        charge: 0,
        distance: 0,
      };
    }

    // function used to create a new affiliationCharge object, and do all the related initializations
    function _createNewAffiliationCharges(affiliationKey) {
      var affiliationObj = map.affiliation_map[affiliationKey];

      return {
        name: affiliationObj.name,
        image: affiliationObj.image,

        avgRate: 0,
        charge: 0,
        distance: 0,
      };
    }

    function _calculateAmounts() {
      var lastZone = null;
      var currentZoneCharges = null;

      var routeLength = route.length;

      var isLeft = true;
      var startId = null;
      var endId = null;

      if (routeLength >= 2) {
        startId = route[0].fromId;
        endId = route[routeLength - 1].toId;
      }

      if (routeLength == 1) {
        startId = route[0].fromId;
        endId = route[0].toId;
      }

      if (startId != null && endId != null) {
        var sum = startId - endId;
        if (sum < 0) {
          isLeft = false;
        } else {
          isLeft = true;
        }
      }

      for (var i = 0; i < routeLength; i++) {
        var currentRoute = route[i];

        var currentZone = zones[currentRoute.zone];
        // determine if we are in a new zone, if we are, then create a
        // new zoneCharge, otherwise just calculate normally
        if (lastZone === null || lastZone.name !== currentZone.name) {
          // apply precision to the distance/charge when we switch zones
          if (currentZoneCharges !== null) {
            currentZoneCharges.distance = Number(currentZoneCharges.distance.toFixed(3));
            currentZoneCharges.charge = Number(currentZoneCharges.charge.toFixed(4));
          }

          currentZoneCharges = _createNewZoneCharges(currentRoute, currentZone, isLeft);

          charges.zoneCharges.push(currentZoneCharges);
          lastZone = currentZone;
        }

        // calculate the total amount
        var currentRouteTotalAmount = currentZoneCharges.rate.map(function (rate) {
          return rate * currentRoute.d;
        });

        //------------ zone section ---------------
        // sum up current routes zone breakdowns
        currentZoneCharges.distance += Number(currentRoute.d.toFixed(3));
        currentZoneCharges.charge += currentRouteTotalAmount[0];

        // keep setting the currentZone exit, so that when we do switch zones
        // we don't need an explicit case for it
        currentZoneCharges.exit = locations[currentRoute.toId].name;

        //------------ affiliation section ---------------
        var currentAffiliation = charges.affiliationCharges[currentZone.affiliation];

        currentAffiliation.distance += Number(currentRoute.d.toFixed(3));
        currentAffiliation.charge += currentRouteTotalAmount[0];

        //------------ grand total section ---------------
        charges.totalToll = _sumArrayValues(charges.totalToll, currentRouteTotalAmount);
        charges.totalDistance += Number(currentRoute.d.toFixed(3));
      }

      // as the last zone does not get precision applied to it, apply it now
      if (currentZoneCharges !== null) {
        currentZoneCharges.distance = Number(currentZoneCharges.distance.toFixed(3));
        currentZoneCharges.charge = Number(currentZoneCharges.charge.toFixed(4));
      }

      // sum up all affiliation charges, and calculate the affilitation averages
      var hasCharge = false;
      var affiliationsArrayLength = affiliationsArray.length;
      for (var i = 0; i < affiliationsArrayLength; i++) {
        var affiliationKey = affiliationsArray[i];
        var affiliationObj = charges.affiliationCharges[affiliationKey];

        currentAffiliation.distance = Number(currentAffiliation.distance.toFixed(3));
        currentAffiliation.charge = Number(currentAffiliation.charge.toFixed(4));

        affiliationObj.avgRate = Number((affiliationObj.charge / affiliationObj.distance).toFixed(4));

        charges.affiliationCharges[affiliationKey] = affiliationObj;

        // the logic to calculate the trip charge and camera charge:
        // if the entry and exit is 407 --> east or 407 --> 407 or east --> 407, use 407 data
        // other wise use MTO data
        if (!hasCharge) {
          var entryAffiliation = affiliationsArray[0];
          var exitAffiliation = affiliationsArray[affiliationsArrayLength - 1];
          if (
            (entryAffiliation == "407" && (exitAffiliation == "407" || exitAffiliation == "MTO")) ||
            (entryAffiliation == "MTO" && exitAffiliation == "407")
          ) {
            affiliationKey = "407";
          } else {
            affiliationKey = "MTO";
          }

          // calculate trip toll charge
          charges.tripTollCharge = _sumArrayValues(charges.tripTollCharge, rates[vehicleType][affiliationKey].trip_toll_charge);

          // calculate camera charge
          charges.cameraCharge = _sumArrayValues(charges.cameraCharge, rates[vehicleType][affiliationKey].camera_charge);

          hasCharge = true;
        }
      }

      // set the total toll before we add the extra charges
      charges.costPerKm = charges.totalDistance == 0 ? 0 : Number((charges.totalToll[0] / charges.totalDistance).toFixed(4));

      // add all extra charges (trip toll, and camera)
      charges.totalAmount = _sumArrayValues(charges.totalToll, charges.tripTollCharge);
      charges.totalAmount = _sumArrayValues(charges.totalAmount, charges.cameraCharge);

      return charges;
    }

    return _calculateAmounts();
  }
};
