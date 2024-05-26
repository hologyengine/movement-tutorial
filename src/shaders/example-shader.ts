
import { RgbNode, standardMaterial } from "@hology/core/shader-nodes";
import { NodeShader, NodeShaderOutput, Parameter } from "@hology/core/shader/shader";

export class ExampleShader extends NodeShader {
  @Parameter()
  color: RgbNode

  output(): NodeShaderOutput {
    return {
      color: standardMaterial({color: this.color})
    }
  }
}

export default ExampleShader
