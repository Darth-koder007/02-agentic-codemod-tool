import { Component } from "react";

export class Tracker extends Component {
  componentDidMount() {
    console.log("mounted");
  }

  render() {
    return <div>Tracking</div>;
  }
}
