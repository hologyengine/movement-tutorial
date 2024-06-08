import 'reflect-metadata'
import './App.css';
import { HologyScene } from '@hology/react'
import shaders from './shaders'
import actors from './actors'
import Game from './services/game'
import { useEffect } from 'react';
import TestWorker from './test.worker?worker'


function App() {

  useEffect(() => {
    console.log(TestWorker)
    const worker = new TestWorker()
    worker.postMessage('hi')
    worker.onmessage = (response) => console.log(response.data) 
  }, []) 


  return (
    <HologyScene gameClass={Game} sceneName='demo' dataDir='data' shaders={shaders} actors={actors}>
    </HologyScene>
  );
}

export default App;