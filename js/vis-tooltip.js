class VisTooltip {
  constructor({ el }) {
    this.el = el;
    this.tooltip = d3
      .select(this.el)
      .append("div")
      .attr("class", "tooltip-container");
  }

  show(html) {
    this.tooltip.html(html).classed("is-visible", true);
    this.eRect = this.el.getBoundingClientRect();
    this.tRect = this.tooltip.node().getBoundingClientRect();
  }

  hide() {
    this.tooltip.classed("is-visible", false);
  }

  move(event) {
    let [x, y] = d3.pointer(event, this.el);

    x -= this.tRect.width / 2;
    if (x < 0) {
      x = 0;
    } else if (x + this.tRect.width > this.eRect.width) {
      x = this.eRect.width - this.tRect.width;
    }

    if (y - this.tRect.height - 8 < 0) {
      y += 8;
    } else {
      y -= this.tRect.height + 8;
    }

    this.tooltip.style("transform", `translate(${x}px,${y}px)`);
  }
}
