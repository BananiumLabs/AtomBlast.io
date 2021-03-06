import { getField, setField } from '../server'
import { MAP_LAYOUT, TILES, TILE_NAMES } from '../../client/js/obj/tiles'
import { generateID, GLOBAL } from '../../client/js/global'
import { spawnAtomAtVent } from './atoms'
import colors from 'colors' // Console colors :D
import { frameSync } from './framesync'

/**
 * Methods to run on server initialization and player connect initialization.
 */

/**
 * Global initialiation. Run once on server start.
 */
export function initGlobal() {
	// Set up atom spawning three times a second. This is processed outside of the player specific behavior because more players joining !== more resources spawn.
	setInterval(() => {
		for (let room in getField(['rooms'])) {
			if (getField(['rooms', room, 'started'])) {
				let tiles = getField(['rooms', room, 'tiles'])
				for (let tile in tiles) {
					if (tiles[tile].type === 'spawner') {
						spawnAtomAtVent(tiles[tile].globalY, tiles[tile].globalX, room, tiles[tile].owner, false)
					}
				}
			}
		}
	}, GLOBAL.ATOM_SPAWN_DELAY)

	// Timer
	setInterval(() => {
		for (let room in getField(['rooms'])) {
			if (getField(['rooms', room, 'started'])) {
				let seconds = getField(['rooms', room, 'time', 'seconds'])

				let minutes = getField(['rooms', room, 'time', 'minutes'])

				// Equivalent to rooms[room].time.seconds++;
				setField(seconds + 1, ['rooms', room, 'time', 'seconds'])

				if (seconds >= 60) {
					setField(0, ['rooms', room, 'time', 'seconds'])
					setField(minutes + 1, ['rooms', room, 'time', 'minutes'])
				}

				// Set formatted Time
				setField(minutes + ':' + ((seconds < 10) ? '0' : '') + seconds, ['rooms', room, 'time', 'formattedTime'])
			}
		}
	}, 1000)
}

/**
 * Run on every player join.
 * @param {*} socket The socket.io instance. INDEPENDENT OF PLAYER (any valid socket connection can go here!!!!!)
 * @param {string} room The name of the room that the player belongs to
 * @param {string} team The name of the team that the player belongs to
 */
export function initPlayer(socket, room, team) {
	// Initialize room array and spawn atoms on first player join
	let thisRoom = getField(['rooms', room])

	// This is sloppy, but idk what's happening
	if (!thisRoom) {
		console.log('Room ' + room + ' was undefined, kicking player ' + socket.id)
		socket.emit('connectionError', { msg: 'The room ' + room + ' could not be joined at this moment, please try again shortly.' })
		return -1
	}

	// Set up capturable tiles
	setField({}, ['rooms', room, 'tiles'])
	// TODO support multiple map layouts
	for (let row = 0; row < MAP_LAYOUT.length; row++) {
		for (let col = 0; col < MAP_LAYOUT[row].length; col++) {
			let currTile = TILES[TILE_NAMES[MAP_LAYOUT[row][col]]]
			if (currTile.type === 'spawner' || currTile.type === 'stronghold' || currTile.type === 'nucleus') {
				// Tile ID is randomized for everything except nucleus, which are equal to nx where x is a number from 0 to 3
				let tileID = (currTile.type === 'nucleus') ? MAP_LAYOUT[row][col] : generateID()

				setField({
					id: tileID,
					type: currTile.type,
					globalX: col,
					globalY: MAP_LAYOUT.length - row - 1,
					captured: false,
					owner: 'all',
					health: GLOBAL[('MAX_' + currTile.type + '_HEALTH').toUpperCase()]
				}, ['rooms', room, 'tiles', tileID])
			}
		}
	}

	// console.log(getField(['teams', team, 'players']))

	// // Check if room is full
	// if (((thisRoom.type === '4v4' || thisRoom.type === '2v2') && thisRoom.teams.length === 2) || thisRoom.teams.length === 4) {
	// 	setField(false, ['rooms', room, 'joinable'])
	// }

	// Create new player in rooms object
	setField({
		id: socket.id,
		name: socket.handshake.query.name,
		room: socket.handshake.query.room,
		team: team,
		health: GLOBAL.MAX_HEALTH,
		posX: GLOBAL.SPAWN_POINTS[thisRoom.teams.length - 1].x * GLOBAL.GRID_SPACING * 2,
		posY: GLOBAL.SPAWN_POINTS[thisRoom.teams.length - 1].y * GLOBAL.GRID_SPACING * 2,
		vx: 0,
		vy: 0,
		experience: 0,
		damagedBy: {},
		shield: 0,
		isSpectating: false
	}, ['rooms', room, 'players', socket.id])
}

/**
 * Run when the first person joins a new room that has not been initialized yet.
 * @param {*} socket socket.io instance. INDEPENDENT OF PLAYER (any valid socket connection can go here!!!!!)
 * @param {string} roomName The name of the room
 */
export function initRoom(socket, roomName) {
	console.log('[Server] '.bold.blue + 'Setting up room '.yellow + ('' + roomName).bold.red + ' as type ' + socket.handshake.query.roomType)
	setField({
		joinable: true,
		teams: [],
		atoms: {},
		compounds: {},
		type: socket.handshake.query.roomType,
		time: {
			frames: 0,
			minutes: 0,
			seconds: 0,
			formattedTime: '0:00'
		}
	}, ['rooms', roomName])

	// Start frame sync
	// Setup room sync- once a frame
	setInterval(() => {
		frameSync(socket, roomName)
	}, 1000 / 60)
}
