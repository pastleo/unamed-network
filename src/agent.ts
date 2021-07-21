interface ConfigMandatory {
  id: string,
}
interface ConfigOptional {
  routeTtl: number,
}

type Config = ConfigMandatory & ConfigOptional;
type ArgConfig = ConfigMandatory & Partial<ConfigOptional>;

export default class Agent {
  private config: Config
  constructor(config: ArgConfig) {
    this.config = {
      routeTtl: 10,
      ...config,
    };
  }

  showConfig() {
    console.log(this.config);
  }

  hello() {
    this.greet(this.config.id);
  }

  private greet(id: string) {
    console.log(`hello, id: ${id}`);
  }
}
