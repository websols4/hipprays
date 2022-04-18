class VisFilter {
  constructor({ el }) {
    this.el = el;
  }

  render() {
    this.container = d3.select(this.el).classed("vis-filter", true);

    Object.keys(this.data).forEach((key) => {
      this.container
        .append("label")
        .attr("class", "filter-label")
        .attr("for", `dtcBrandsFilter${key[0].toUpperCase() + key.slice(1)}`)
        .text("Category");

      this.container
        .append("select")
        .attr("class", "filter-select")
        .attr("id", `dtcBrandsFilter${key[0].toUpperCase() + key.slice(1)}`)
        .on("change", (event) => {
          event.target.dispatchEvent(
            new CustomEvent("filterchange", {
              detail: {
                key,
                value: event.target.value,
              },
              bubbles: true,
            })
          );
        })
        .selectAll("option")
        .data(this.data[key].options)
        .join("option")
        .attr("value", (d) => d)
        .attr("selected", (d) =>
          d === this.data[key].selected ? "selected" : null
        )
        .text((d) => d);
    });
  }

  updateData(data) {
    this.data = data;
    this.render();
  }
}
