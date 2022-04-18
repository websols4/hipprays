class VisSizeLegend {
  constructor({ el, title }) {
    this.el = el;
    this.title = title;
    this.init();
  }

  init() {
    this.format = d3.format(",~s");

    this.container = d3.select(this.el);

    this.toggleContainer = this.container
      .append("div")
      .attr(
        "class",
        "panel-container panel-container--bottom-left panel-container--button is-hidden"
      )
      .on("click", () => {
        this.toggleContainer.classed("is-hidden", true);
        this.legendContainer.classed("is-hidden", false);
      });

    this.open = this.toggleContainer
      .append("button")
      .attr("type", "button")
      .attr("class", "button-open-legend")
      .attr("aria-label", "Open legend");

    this.legendContainer = this.container
      .append("div")
      .attr(
        "class",
        "panel-container panel-container--bottom-left size-legend"
      );

    this.close = this.legendContainer
      .append("button")
      .attr("type", "button")
      .attr("class", "button-close-legend")
      .attr("aria-label", "Close legend")
      .on("click", () => {
        this.toggleContainer.classed("is-hidden", false);
        this.legendContainer.classed("is-hidden", true);
      });

    this.titleContainer = this.legendContainer
      .append("div")
      .attr("class", "legend-title")
      .text(this.title);
    this.svg = this.legendContainer.append("div").append("svg");
    this.g = this.svg.append("g");
  }

  render() {
    this.renderLegendItems();
    this.autoViewBox();
  }

  renderLegendItems() {
    let values = this.scale.ticks(5);
    // For values less than 50M, fixed ticks
    values = [1e6, 5e6, 1e7, ...values.filter((d) => d >= 5e7)];

    const ticks = values.map((d) => ({
      value: d,
      circleR: this.scale(d),
      circleY: -this.scale(d),
      labelY: -this.scale(d) * 2,
    }));

    d3.pairs(ticks, (a, b) => {
      if (a.labelY - b.labelY < 12) b.labelY = a.labelY - 12;
    });

    const maxR = ticks[ticks.length - 1].circleR;

    this.g
      .selectAll(".item")
      .data(ticks.sort((a, b) => d3.descending(a.value, b.value)))
      .join((enter) =>
        enter
          .append("g")
          .attr("class", "item")
          .call((g) => g.append("polyline").attr("stroke", "currentColor"))
          .call((g) =>
            g
              .append("circle")
              .attr("class", "size-circle")
              .attr("stroke", "currentColor")
          )
          .call((g) => g.append("text"))
      )
      .call((g) =>
        g
          .select("circle")
          .attr("cy", (d) => d.circleY)
          .attr("r", (d) => d.circleR)
      )
      .call((g) =>
        g
          .select("text")
          .attr("x", maxR + 36)
          .attr("y", (d) => d.labelY)
          .attr("dy", "0.32em")
          .text((d) => this.format(d.value))
          .each(function () {})
      )
      .call((g) =>
        g
          .select("polyline")
          .attr(
            "points",
            (d) =>
              `0,${d.circleY * 2} ${maxR + 16},${d.labelY} ${maxR + 32},${
                d.labelY
              }`
          )
      );
  }

  autoViewBox() {
    let { x, y, width, height } = this.g.node().getBBox();
    x = Math.floor(x) - 4;
    y = Math.floor(y) - 4;
    width = Math.ceil(width) + 8;
    height = Math.ceil(height) + 8;
    this.svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [x, y, width, height]);
  }

  updateScale(scale) {
    this.scale = scale;
    this.render();
  }
}
