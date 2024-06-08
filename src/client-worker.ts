
export function init() {
  self.onmessage = (msg: string) => {
    self.postMessage("this is from worker " + JSON.stringify(msg)) // todo: type woes
  }
  // this sets up a service.
  // should export types for requests
  // similar to 
}


export type AbstractMethodsDef = Record<string, (...args: any[]) => Promise<unknown> | unknown>


// Methods should be able to transfer data as well. 
// It responds with a post message. 

// Could also structure it to be like events instead of method calls. 
// Then instead of methods, you have handlers. Client sends events that the worker handles async

// maybe don't abstract this until I have a solution, just deal with strings and dynamic types

// use cases
// - navmesh generation
// - physics. should use dedicated worker to keep track of state of physics. can respond to calls like applying forces and such.
//      For a lot of tiny requests it would likely be too slow. read requests and such would likely not work. if needed to do those, I would need to keep a representation of physivs world on client and sync before step 
// - generating scatter
// - generating different resolutions of meshes. 
// -

const methods: AbstractMethodsDef = {
  hello: () => "from server"
}

export type x = ''

