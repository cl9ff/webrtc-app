import {HashRouter, Routes, Route} from 'react-router-dom';
import Room from './Pages/Room';
import Main from './Pages/Main';
import NotFound404 from './Pages/NotFound404';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route exact path='/room/:id' element={<Room/>}/>
        <Route exact path='/' element={<Main/>}/>
        <Route path='*' element={<NotFound404/>}/>
      </Routes>
    </HashRouter>
  );
}

export default App;
