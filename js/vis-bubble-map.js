class VisBubbleMap {
  constructor({ el, brandsData, masterData, worldData }) {
    this.el = el;
    this.brandsData = brandsData;
    this.masterData = masterData;
    this.worldData = worldData;
    this.zoomed = this.zoomed.bind(this);
    this.resize = this.resize.bind(this);
    this.entered = this.entered.bind(this);
    this.moved = this.moved.bind(this);
    this.left = this.left.bind(this);
    this.init();
  }

  init() {
    this.setup();
    this.scaffold();
    this.wrangleGeo();
    this.wrangleData();
    this.resize();
    this.filterData();
    window.addEventListener("resize", this.resize);
  }

  setup() {
    this.accessor = {
      geo: {
        id: (d) => d.id,
        code: (d) => d.properties.iso_a2.toLowerCase(),
        name: (d) => d.properties.name,
      },
      master: {
        id: (d) => d["Brand#"],
        category: (d) =>
          ["", "?"].includes(d.Category) ? "Other" : d.Category,
      },
      brand: {
        id: (d) => d["Code/ID"],
        brandName: (d) => d["Brand Name"],
        countryCode: (d) => d.Country,
        category: (d) =>
          this.accessor.master.category(this.brandById.get(d["Code/ID"])),
        traffic: (d) =>
          +d.Traffic * (1 - +d["Bounce Rate"].slice(0, -1) / 100) || 0,
      },
    };

    this.formatValue = d3.format(",.4~s");
    this.formatShare = (d) => (d < 0.001 ? "<0.1%" : d3.format(".1%")(d));

    this.margin = {
      top: 32,
      right: 16,
      bottom: 32,
      left: 16,
    };

    this.projection = d3.geoNaturalEarth1().rotate([-10, 0]);
    this.path = d3.geoPath(this.projection);

    this.r = d3
      .scaleSqrt()
      .domain([
        0,
        d3.max([
          ...d3
            .rollup(
              this.brandsData,
              (v) => Math.round(d3.sum(v, this.accessor.brand.traffic)),
              this.accessor.brand.countryCode
            )
            .values(),
        ]),
      ]);

    this.zoom = d3.zoom().on("zoom", this.zoomed).scaleExtent([1, 32]);
  }

  scaffold() {
    this.container = d3
      .select(this.el)
      .append("div")
      .attr("class", "bubble-map");

    this.svg = this.container.append("svg").attr("class", "chart-svg");
    this.g = this.svg.append("g");
    this.country = this.g.append("g").selectAll("path");
    this.bubble = this.g.append("g").selectAll("circle");

    this.legend = new VisSizeLegend({
      el: this.container.node(),
      title: "Non-Bounce Traffic",
    });

    this.filterContainer = this.container
      .append("div")
      .attr("class", "panel-container panel-container--top-right");
    this.filter = new VisFilter({
      el: this.filterContainer.node(),
    });

    this.filterContainer.on("filterchange", (event) => {
      const { key, value } = event.detail;
      this.filterState[key].selected = value;
      this.filterData();
    });

    this.tooltip = new VisTooltip({
      el: this.container.node(),
    });
  }

  wrangleGeo() {
    // Remove Antarctica
    this.worldData.features = this.worldData.features.filter(
      (feature) => this.accessor.geo.id(feature) !== "010"
    );

    // Add missing country code
    this.worldData.features.forEach((feature) => {
      if (this.accessor.geo.id(feature) === "250") {
        // France
        feature.properties.iso_a2 = "FR";
      } else if (this.accessor.geo.id(feature) === "578") {
        // Norway
        feature.properties.iso_a2 = "NO";
      }
    });

    // Get the center of the largest polygon within a country's multi-polygons
    this.worldData.features.forEach((feature) => {
      if (this.accessor.geo.id(feature) === "643") {
        // Russia
        feature.properties.center = turf.centroid(feature.geometry);
      } else if (feature.geometry.type === "MultiPolygon") {
        // Countries with multiple separated polygons (USA, France, etc)
        let maxAreaPolygon,
          maxArea = 0;
        for (const poly in feature.geometry.coordinates) {
          const polygon = turf.polygon(feature.geometry.coordinates[poly]);
          const area = turf.area(polygon);
          if (area > maxArea) {
            maxArea = area;
            maxAreaPolygon = polygon;
          }
        }
        feature.properties.center = turf.centerOfMass(maxAreaPolygon);
      } else {
        feature.properties.center = turf.centerOfMass(feature.geometry);
      }
    });

    this.featureByCode = d3.index(
      this.worldData.features.filter(
        (feature) => this.accessor.geo.code(feature) !== "-99"
      ),
      this.accessor.geo.code
    );
  }

  wrangleData() {
    this.brandById = d3.index(this.masterData, this.accessor.master.id);

    this.categories = [
      ...new Set(this.masterData.map(this.accessor.master.category)),
    ].sort(d3.ascending);
    this.categories.unshift("ALL");

    this.filterState = {
      category: {
        label: "Category",
        selected: "ALL",
        options: this.categories,
      },
    };

    this.filter.updateData(this.filterState);
  }

  filterData() {
    const filtered = this.brandsData.filter((d) => {
      // Countries with no geo
      if (!this.featureByCode.has(this.accessor.brand.countryCode(d)))
        return false;
      // Traffic is 0
      if (this.accessor.brand.traffic(d) === 0) return false;
      if (
        this.filterState.category.selected !== "ALL" &&
        this.accessor.brand.category(d) !== this.filterState.category.selected
      )
        return false;
      return true;
    });
    this.valueByCountryCode = d3.rollup(
      filtered,
      (v) => {
        const total = d3.sum(v, this.accessor.brand.traffic);
        const allBrands = v
          .slice()
          .sort((a, b) =>
            d3.descending(
              this.accessor.brand.traffic(a),
              this.accessor.brand.traffic(b)
            )
          );
        const topN = 5;
        const topBrands =
          allBrands.length > topN
            ? [
                ...allBrands.slice(0, topN).map((d, i) => ({
                  rank: i + 1,
                  brandName: this.accessor.brand.brandName(d),
                  traffic: this.accessor.brand.traffic(d),
                  trafficShare: this.accessor.brand.traffic(d) / total,
                })),
                {
                  brandName: "Others",
                  traffic: d3.sum(
                    allBrands.slice(topN),
                    this.accessor.brand.traffic
                  ),
                  trafficShare:
                    d3.sum(allBrands.slice(topN), this.accessor.brand.traffic) /
                    total,
                },
              ]
            : allBrands.map((d, i) => ({
                rank: i + 1,
                brandName: this.accessor.brand.brandName(d),
                traffic: this.accessor.brand.traffic(d),
                trafficShare: this.accessor.brand.traffic(d) / total,
              }));
        return {
          total,
          topBrands,
        };
      },
      this.accessor.brand.countryCode
    );

    this.render();
  }

  resize() {
    this.width = this.el.clientWidth;
    this.boundedWidth = this.width - this.margin.left - this.margin.right;

    const [[x0, y0], [x1, y1]] = d3
      .geoPath(this.projection.fitWidth(this.boundedWidth, this.worldData))
      .bounds(this.worldData);
    this.boundedHeight = Math.ceil(y1 - y0);
    this.height = Math.max(
      this.boundedHeight + this.margin.top + this.margin.bottom,
      this.el.clientHeight
    );

    this.projection.fitExtent(
      [
        [this.margin.left, this.margin.top],
        [this.width - this.margin.right, this.height - this.margin.bottom],
      ],
      this.worldData
    );

    this.r.range([0, Math.round(this.boundedWidth / 8)]);
    this.legend.updateScale(this.r);

    this.zoom.translateExtent([
      [0, 0],
      [this.width, this.height],
    ]);

    this.svg.call(this.zoom);

    this.svg.attr("viewBox", [0, 0, this.width, this.height]);

    if (this.valueByCountryCode) {
      this.svg.call(this.zoom.transform, d3.zoomIdentity);
      this.render();
    }
  }

  render() {
    const t = this.svg.transition();
    this.renderMap();
    this.renderBubbles(t);
  }

  renderMap() {
    this.country = this.country
      .data(this.worldData.features, this.accessor.geo.id)
      .join((enter) =>
        enter
          .append("path")
          .attr("class", "country-path")
          .call((enter) =>
            enter
              .filter((d) =>
                this.valueByCountryCode.has(this.accessor.geo.code(d))
              )
              .on("mouseenter", (event, d) => {
                this.entered(this.accessor.geo.code(d));
              })
              .on("mousemove", this.moved)
              .on("mouseleave", this.left)
          )
      )
      .attr("d", this.path);
  }

  renderBubbles(t) {
    const { k } = d3.zoomTransform(this.svg.node());

    this.bubble = this.bubble
      .data(
        Array.from(this.valueByCountryCode, ([countryCode, value]) => ({
          countryCode,
          value,
        })).sort((a, b) => d3.descending(a.value.total, b.value.total)),
        (d) => d.countryCode
      )
      .join((enter) =>
        enter
          .append("circle")
          .attr("class", "bubble-circle")
          .attr("r", 0)
          .on("mouseenter", (event, d) => {
            this.entered(d.countryCode);
          })
          .on("mousemove", this.moved)
          .on("mouseleave", this.left)
      )
      .attr("transform", (d) => {
        const feature = this.featureByCode.get(d.countryCode);
        return `translate(${this.path.centroid(feature.properties.center)})`;
      });

    if (t) {
      this.bubble.transition(t).attr("r", (d) => this.r(d.value.total) / k);
    } else {
      this.bubble.attr("r", (d) => this.r(d.value.total) / k);
    }
  }

  zoomed({ transform }) {
    this.g.attr("transform", transform);
    this.renderBubbles();
  }

  entered(countryCode) {
    this.country.classed("is-active", (d, i, n) => {
      if (this.accessor.geo.code(d) === countryCode) {
        d3.select(n[i]).raise();
        return true;
      }
      return false;
    });
    this.bubble.classed("is-active", (d) => d.countryCode === countryCode);

    const countryName = this.accessor.geo.name(
      this.featureByCode.get(countryCode)
    );

    if (this.valueByCountryCode.has(countryCode)) {
      const { total, topBrands } = this.valueByCountryCode.get(countryCode);

      this.tooltip.show(/*html*/ `
      <div class="country-name">${countryName}</div>
      <div>
      <table>
        <thead>
          <tr>
            <th></th>
            <th style="text-align: left">Brand</th>
            <th style="text-align: right">Traffic</th>
            <th colspan="2" style="text-align: left">Traffic Share</th>
          </tr>
        </thead>
        <tbody>
          ${topBrands
            .map(
              (e) => /*html*/ `
            <tr>
              <td style="text-align: right">${e.rank || ""}</td>
              <td style="text-align: left">${e.brandName}</td>
              <td style="text-align: right">${this.formatValue(e.traffic)}</td>
              <td style="text-align: right">${this.formatShare(
                e.trafficShare
              )}</td>
              <td>
                <div class="share-background">
                  <div class="share-foreground" style="width: ${
                    e.trafficShare * 100
                  }%"></div>
                </div>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td style="text-align: left">TOTAL</td>
            <td style="text-align: right">${this.formatValue(total)}</td>
            <td style="text-align: right">100%</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      </div>
    `);
    }
  }

  moved() {
    this.tooltip.move(event);
  }

  left() {
    this.country.classed("is-active", false);
    this.bubble.classed("is-active", false);

    this.tooltip.hide();
  }
}
