import { createRoot } from 'react-dom/client'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import Home from './Home'
import SplashScreen from './splash_screen'
createRoot(document.getElementById('root')!).render(<ChakraProvider value={defaultSystem}><SplashScreen><Home /></SplashScreen></ChakraProvider>)
