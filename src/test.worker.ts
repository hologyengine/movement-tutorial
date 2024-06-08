import {init} from './client-worker'
init()
/*

I think this could simply have a single import that registers all these things
The worker instance should be passed to the game which will then instantate many versions of it.

The core library can then use this for whatever it wants.

It should have a typed interface to pass work to it. 
It could be used for many 

*/


