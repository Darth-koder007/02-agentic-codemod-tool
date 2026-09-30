import { Component } from "react";

interface ToggleProps {
  label: string;
}

export class Toggle extends Component<ToggleProps> {
  constructor(props: ToggleProps) {
    super(props);
    this.state = { on: false };
  }

  render() {
    return (
      <button onClick={() => this.setState({ on: !this.state.on })}>
        {this.props.label}: {this.state.on ? "on" : "off"}
      </button>
    );
  }
}
