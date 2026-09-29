import { Component } from "react";

interface CounterProps {
  label: string;
}

export class Counter extends Component<CounterProps> {
  constructor(props: CounterProps) {
    super(props);
    this.state = { count: 0 };
  }

  render() {
    return (
      <div>
        <span>
          {this.props.label}: {this.state.count}
        </span>
        <button onClick={() => this.setState({ count: this.state.count + 1 })}>Increment</button>
      </div>
    );
  }
}
