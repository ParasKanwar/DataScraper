const fs = require("fs");
const path = require("path");
const rateData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/rateData.json")));
const zoneData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/zoneData.json")));
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/test.json")));
const mapData = JSON.parse(fs.readFileSync(path.join(__dirname, "./testingData/mapData.json")));
const date_for_map_data = "2019-10-08";
const TollCalculator = require("./utils/Final");
const commandLineArgs = require("command-line-args");
const options = [
  { name: "vehicle_type", alias: "v", type: String },
  { name: "directory_path", alias: "d", type: String },
  { name: "from", alias: "f", type: Number },
  { name: "to", alias: "t", type: Number },
  { name: "rate_type", alias: "r", type: String },
];
const args = commandLineArgs(options);
console.log(args);
const { RouteGenerator } = require("./utils/RouteGenerator");
// inititalizing route generator with appropriate map data
RouteGenerator.init(mapData[date_for_map_data], zoneData);
const map_data_for_specific_date = RouteGenerator.generateMapData(testData.date);
const tollCalculator = new TollCalculator(rateData, zoneData);
const total_locations = Object.keys(mapData[date_for_map_data].locations).length;
const vehicleTypes = ["multi", "light", "heavy"];
const rateTypes = [
  "wd_0600_0700",
  "wd_0700_0930",
  "wd_0930_1000",
  "wd_1000_1030",
  "wd_1030_1430",
  "wd_1430_1500",
  "wd_1500_1530",
  "wd_1530_1800",
  "wd_1800_1900",
  "wd_1900_0600",
  "nh_1100_1900",
  "nh_1900_1100",
];
let totalSuccess = 0;
let err_count = 0;
if (args.directory_path)
  for (let i = 1; i <= total_locations; i++) {
    for (let j = 1; j <= total_locations; j++) {
      for (let vehicleType of vehicleTypes) {
        for (let rateType of rateTypes) {
          try {
            const route_details_to_feed_into_algorithm = RouteGenerator.generateRoute(map_data_for_specific_date, i, j);
            const result =
              j !== i &&
              tollCalculator.calculate(
                testData.date,
                map_data_for_specific_date,
                route_details_to_feed_into_algorithm,
                vehicleType,
                rateType
              );
            totalSuccess++;
          } catch (e) {
            err_count++;
          }
        }
      }
    }
  }

if (args.from && args.to && args.vehicle_type && args.rate_type) {
  const route_details_to_feed_into_algorithm = RouteGenerator.generateRoute(map_data_for_specific_date, args.from, args.to);
  const val = tollCalculator.calculate(
    testData.date,
    map_data_for_specific_date,
    route_details_to_feed_into_algorithm,
    args.vehicle_type,
    args.rate_type
  );
  console.log(val);
}
