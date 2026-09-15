import { createContext } from 'react'

export const TABS = ['/home', '/topics', '/calendar', '/statistics']
export const NavDirectionContext = createContext({ direction: 0, setDirection: () => {} })
