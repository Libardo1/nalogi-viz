// adapted to this data, not the original, general one
function CoincidenceTextGraph(selector) {
  "use strict";

  var width = 1000;
  var height = 600;
  var forceWidth = 750;
  var fontSize = 14;
  var transitionTime = 500;  // ms

  var svg = d3.select(selector).append("svg")
    .attr("width", width)
    .attr("height", height);

  var g = svg.append("g");

  var siNumberApprox = function (x) {
    var prefix = d3.formatPrefix(x);
    var scaled = prefix.scale(x);
    return scaled.toFixed(scaled < 10 ? 1 : 0) + prefix.symbol;
  };

  this.rowsToGraph = function (rows) {
    // here lodash would be really, really useful!

    // we assume that all rows have the same keys
    var categories = [];
    for (var k in rows[0]) {
      categories.push(k);
    };
    // assuming no commas in items
    var itemId = function (k, v) {
      return k + "," + v;
    };

    var nodesDict = {};
    var key = "";
    var id = 0;
    rows.forEach(function (row) {
      categories.forEach(function (cat) {
        key = itemId(cat, row[cat]);
        if (key in nodesDict) {
          nodesDict[key].count += 1;
        } else {
          nodesDict[key] = {
            name:     row[cat],
            category: cat,
            count:    1,
            id:       id,
          };
          id++;
        }
      });
    });
    var nodes = [];
    for (key in nodesDict) {
      nodes.push(nodesDict[key]);
    }

    var edgesDict = {};
    var key2 = "";
    var pairKey = "";
    rows.forEach(function (row) {
      categories.forEach(function (cat) {
        key = itemId(cat, row[cat]);
        categories.forEach(function (cat2) {
          key2 = itemId(cat2, row[cat2]);
          if (cat < cat2) {
            pairKey = key + "+" + key2;
            if (pairKey in edgesDict) {
              edgesDict[pairKey].count += 1;
            } else {
              edgesDict[pairKey] = {
                source: nodesDict[key].id,
                target: nodesDict[key2].id,
                count:  1,
              };
            }
          }
        });
      });
    });
    var links = [];
    var link;
    for (pairKey in edgesDict) {
      link = edgesDict[pairKey];
      link.oe = (link.count * rows.length) / (nodes[link.source].count * nodes[link.target].count);
      links.push(link);
    }

    return {nodes: nodes, links: links};
  };


  this.fromJSON = function (filepath, options) {
    var that = this;
    d3.json(filepath, function (error, graph) {
      that.draw(graph, options);
      if (options.legend) {
        that.createLegend();
      }
    });
  };


  this.fromCSV = function (filepath, options) {
    var that = this;
    d3.csv(filepath, function (error, rows) {
      // not the nices way for categories, but should work
      // for Legend
      var categories = [];
      for (var k in rows[0]) {
        categories.push(k);
      };
      options.categories = categories;
      that.draw(that.rowsToGraph(rows), options);
      if (options.legend) {
        that.createLegend();
      }
    });
  };


  this.draw = function (graph, options) {

    var options = options || {};
    var maxSize = options.maxSize || 75;
    var baseCharge = options.baseCharge || -70;
    var eoThresholdMin = options.eoThresholdMin || 1.25;
    var muteCategory = options.muteCategory || false;

    // TODO no predefined things here, move to main.js
    this.categories = options.categories || ["nałóg", "daje", "zwalcza"];

    this.countThresholds = [10, 100, 1000];
    this.countText = options.countText || "occurrences";
    this.opacityThresholds = [2, 8, 32];
    this.opacityText = options.opacityText || "more than random";

    // colors from # d3.scale.category10()
    var colors = d3.scale.ordinal()
      .domain(this.categories)
      .range(["#1f77b4", "#2ca02c", "#d62728"]);
    // TODO colors as an optional option

    this.colors = colors;

    graph.links = graph.links.sort(function (a, b) {
      return b.count - a.count;
    });

    // but it hides some data...
    graph.links = graph.links.filter(function (e) {
      return e.oe > eoThresholdMin; // || e.oe < 0.5;
    });

    graph.links.forEach(function (e) {
      e.PMI = Math.log(e.oe);
    });

    var maxCount = d3.max(graph.nodes, function (d) { return d.count; });
    console.log("minCount", d3.min(graph.nodes, function (d) { return d.count; }));
    console.log("maxCount", maxCount);

    var sizeScale = d3.scale.pow().exponent(0.15)
      .domain([0, maxCount])
      .range([0, maxSize]);

    this.sizeScale = sizeScale;

    var maxPMI = d3.max(graph.links, function (e) { return e.PMI; });
    console.log("maxPMI", maxPMI);

    var opacityScale = d3.scale.pow().exponent(0.5)  // XXX do podswietlania moze raczej prawdopodobienstwo warunkowe?
      .domain([0, maxPMI])
      .range([0, 1]);

    this.opacityScale = opacityScale;

    var force = d3.layout.force()
        .charge(function (d) { return baseCharge * sizeScale(d.count); })
        .linkDistance(0)
        .gravity(0.4)
        .size([forceWidth, height])
        .linkStrength(function (e) {
          return e.PMI > 0 ? e.PMI/maxPMI : 0;
        })
        .nodes(graph.nodes)
        .links(graph.links);

    var node = g.selectAll(".label")
      .data(graph.nodes)
      .enter().append("text")
        .attr("class", "label")
        .style("font-size", function (d) { return sizeScale(d.count); })
        .style("fill", function (d) {
          return colors(d.category);
        })
        .style("opacity", 0.8)
        .on("mouseover", function (d) {
          node.transition()
            .duration(transitionTime)
            .style("opacity", function (d2) {
              var link;
              if (d === d2) {
                return 1;
              } else {
                for (var i = 0; i < graph.links.length; i++) {
                  link = graph.links[i];
                  if ((link.target === d && link.source === d2) || (link.source === d && link.target === d2)) {
                    return opacityScale(link.PMI);
                  }
                }
                return 0;
              }
            });
        })
        .on("mouseout", function () {
          node.transition()
            .duration(transitionTime)
            .style("opacity", 0.8);
        })
        .text(function (d) { return d.name.toLowerCase(); });

    var drag = force.drag();
    node.call(drag);

    this.node = node;

    force.start();

    force.on("tick", function() {
        node.attr("x", function(d) { return d.x; })
            .attr("y", function(d) { return d.y; });

    });

  };


  this.createLegend = function () {

    var that = this;

    var boxSize = 20;
    var legendSpacing = 25;
    var labelMargin = 30;

    // categories

    var legendCategory = g.append("g")
      .attr("transform", "translate(" + forceWidth + ", 50)");

    var legendCategoryItem = legendCategory.selectAll("g")
      .data(that.categories)
      .enter()
      .append("g")
        .attr("transform", function (d, i) {
          return "translate(0," + (i * legendSpacing) + ")"
        })
        .style("cursor", "pointer")
        .on("mouseover", function (d) {
          that.node.transition()
            .duration(transitionTime)
            .style("opacity", function (d2) {
              return d === d2.category ? 1 : 0.2;
            });
        })
        .on("mouseout", function (d) {
          that.node.transition()
            .duration(transitionTime)
            .style("opacity", 0.8);
        });

    legendCategoryItem.append('rect')
      .attr('class', 'legend-box')
      .attr('x', 0)
      .attr('width', boxSize)
      .attr('height', boxSize)
      .style('fill', function (d) { return that.colors(d); });

    legendCategoryItem.append('text')
      .attr('class', 'legend-hoverable-label')
      .attr('x', labelMargin)
      .attr('y', 0.75 * boxSize)
      .text(function (d) { return d; })
      .style("font-size", "" + fontSize + "px");

    // sizes

    var legendSize = g.append("g")
      .attr("transform", "translate(" + forceWidth + ", 200)");

    var legendSizeItem = legendSize.selectAll("g")
      .data(this.countThresholds)
      .enter()
      .append("g")
        .attr("transform", function (d, i) {
          return "translate(0," + (i * legendSpacing) + ")"
        });

    legendSizeItem.append("text")
      .attr("class", "legend-label")
      .attr("x", boxSize / 2)
      .style("text-anchor", "middle")
      .style("dominant-baseline", "middle")
      .style("font-size", function (d) { return that.sizeScale(d); })
      .text("x");

    legendSizeItem.append("text")
      .attr("class", "legend-label")
      .attr("x", labelMargin)
      .style("dominant-baseline", "middle")
      .style("font-size", "" + fontSize + "px")
      .text(function (d) { return "" + d + " " + that.countText; });

    // opacity

    var legendOpacity = g.append("g")
      .attr("transform", "translate(" + forceWidth + ", 350)");

    var legendOpacityItem = legendOpacity.selectAll("g")
      .data(this.opacityThresholds)
      .enter()
      .append("g")
        .attr("transform", function (d, i) {
          return "translate(0," + (i * legendSpacing) + ")"
        });

    legendOpacityItem.append("text")
      .attr("class", "legend-label")
      .attr("x", boxSize / 2)
      .style("text-anchor", "middle")
      .style("dominant-baseline", "middle")
      .style("font-size", "" + fontSize + "px")
      .style("opacity", function (d) { return that.opacityScale(Math.log(d)); })
      .text("x");

    legendOpacityItem.append("text")
      .attr("class", "legend-label")
      .attr("x", labelMargin)
      .style("dominant-baseline", "middle")
      .style("font-size", "" + fontSize + "px")
      .text(function (d) { return "" + d + "x " + that.opacityText; });

  };

  // this.credits = function () {

  //   g.append("g")
  //     .attr("class", "credit")
  //     .attr("transform", "translate(" + (forceWidth + 30) + ", 500)")
  //     .append("a")
  //     .attr("xref:href", "http://p.migdal.pl")
  //     .attr("target", "_blank")
  //     .selectAll("text")
  //     .data(["data by Mikołaj Czyż", "vis by Piotr Migdał", "2016"])
  //     .enter()
  //       .append("text")
  //         .attr("y", function (d, i) { return 1.5 * fontSize * i; })
  //         .style("font-size", "" + fontSize + "px")
  //         .text(function (d) { return d; });

  // }

  this.remove = function () {
    svg.remove();
  }

}
