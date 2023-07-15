import dotenv from "dotenv"
import express from "express"
import fs from "fs"
import https from "https"
import {MongoClient} from "mongodb"
import logger from "morgan"

dotenv.config()

const client = await MongoClient.connect("mongodb://127.0.0.1:27017")
const db = client.db("broadview")

const bans = db.collection("bans")

const app = express()
app.use(
	express.json(),
	logger("dev"),
	(req, res, next) => {
		res.header("Access-Control-Allow-Origin", "*")
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, API-Key")
		next()
	},
	(req, res, next) => {
		const apiKey = req.get("API-Key")
		if (!apiKey || apiKey !== process.env.API_KEY) {
			res.status(401).send("Unauthorized")
			return
		} else next()
	}
)

app.get("/", async (req, res) => {
	res.status(200).send()
})

app.get("/ban/:userId", async (req, res) => {
	const userId = parseInt(req.params.userId)
	if (!userId) {
		res.status(400).send("User ID is NaN")
		return
	}

	const ban = await bans.findOne({
		$and: [{userId: userId}, {$or: [{expires: {$exists: false}}, {expires: {$gt: new Date()}}]}]
	})

	let response: any
	if (ban) {
		response = {
			banned: true,
			reason: ban.reason,
			expires: ban.expires,
			moderatorId: ban.moderatorId,
			timestamp: ban.timestamp
		}
	} else {
		response = {
			banned: false
		}
	}

	res.status(200).send(response)
})

app.get("/bans", async (req, res) => {
	res.status(200).send(await db.collection("bans").find().toArray())
})

app.put("/ban/:userId", async (req, res) => {
	const userId = parseInt(req.params.userId)
	if (!userId) {
		res.status(400).send("User ID is NaN")
		return
	}

	const alreadyBanned = await bans.findOne({
		$and: [{userId: userId}, {$or: [{expires: {$exists: false}}, {expires: {$gt: new Date()}}]}]
	})
	if (alreadyBanned) {
		res.status(400).send("User is already banned")
		return
	}

	const reason = req.body.reason
	let expires = req.body.expires !== undefined ? Date.parse(req.body.expires) : undefined
	const moderatorId = req.body.moderatorId

	if (typeof reason !== "string") {
		res.status(400).send("Reason is missing or is not a string")
		return
	} else if (expires !== undefined && isNaN(expires)) {
		res.status(400).send("Unban date is missing or is not a valid date")
		return
	} else if (typeof moderatorId !== "number") {
		res.status(400).send("Moderator ID is missing or is not a number")
		return
	}

	await bans.insertOne({...{userId, reason, moderatorId, timestamp: new Date()}, ...(expires !== undefined ? {expires: new Date(expires)} : {})})

	res.status(200).send("User has been banned")
})

app.delete("/ban/:userId", async (req, res) => {
	const userId = parseInt(req.params.userId)
	if (!userId) {
		res.status(400).send("User ID is NaN")
		return
	}

	const attempt = await bans.deleteMany({
		$or: [{expires: {$gt: new Date()}}, {expires: {$exists: false}}]
	})
	if (attempt.deletedCount === 0) {
		res.status(400).send("User is not banned")
		return
	}

	res.status(200).send(`User has been unbanned. ${attempt.deletedCount} bans were removed`)
})

https.createServer({key: fs.readFileSync("broadview.key"), cert: fs.readFileSync("broadview.crt")}, app).listen(443, undefined, undefined, () => {
	console.log("Listening on port 443")
})
