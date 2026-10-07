import { createRoot } from 'react-dom/client'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import Home from './Home'
createRoot(document.getElementById('root')!).render(<ChakraProvider value={defaultSystem}><Home /></ChakraProvider>)
