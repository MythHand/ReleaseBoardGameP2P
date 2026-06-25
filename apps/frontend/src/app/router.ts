// Generouted, changes to this file will be overridden
/* eslint-disable */

import { components, hooks, utils } from '@generouted/react-router/client'

export type Path =
  | `/`
  | `/board/:gameId/stats`
  | `/help`
  | `/lobby/:lobbyId`
  | `/start`

export type Params = {
  '/board/:gameId/stats': { gameId: string }
  '/lobby/:lobbyId': { lobbyId: string }
}

export type ModalPath = never

export const { Link, Navigate } = components<Path, Params>()
export const { useModals, useNavigate, useParams } = hooks<Path, Params, ModalPath>()
export const { redirect } = utils<Path, Params>()
