const { REST } = require('@discordjs/rest')
const { Client } = require('discord.js')
const { Routes, GatewayIntentBits } = require('discord-api-types/v9')
const { config } = require('dotenv')
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice')

config()

const STRING = 3

const commands = [
  {
    name: 'enqueue',
    description: 'Put a song in the queue',
    options: [
      {
        name: 'url',
        description: 'The music url',
        type: STRING,
      },
      {
        name: 'title',
        description: 'music title',
        type: STRING,
      },
    ],
  },
  {
    name: 'skip',
    description: 'Skip current song',
  },
  {
    name: 'queue',
    description: 'Show the queue',
  },
]

const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const GUILD_ID = process.env.DISCORD_GUILD_ID
const TOKEN = process.env.DISCORD_TOKEN

const rest = new REST({ version: '10' }).setToken(TOKEN)

;(async () => {
  try {
    console.log('Started refreshing application (/) commands.')

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    })

    console.log('Successfully reloaded application (/) commands.')
  } catch (error) {
    console.error(error)
  }
})()

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
})

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
})

const ytdl = require('ytdl-core-discord')

class SongQueue {
  constructor() {
    this.queue = []
  }

  shift() {
    return this.queue.shift()
  }

  add(song) {
    this.queue.push(song)
  }

  get() {
    return this.queue
  }

  first() {
    return this.queue[0]
  }

  remove(song) {
    this.queue.splice(this.queue.indexOf(song), 1)
  }
}

const songQueue = new SongQueue()

client.on('interactionCreate', async (interaction) => {
  if (interaction.commandName === 'queue') {
    await interaction.reply(
      `The queue is: ${songQueue
        .get()
        .map((song) => song.title)
        .join(', ')}`
    )
  }
  if (interaction.commandName === 'enqueue') {
    const song_url = interaction.options.getString('url')
    const song_title = interaction.options.getString('title')

    const songSearch = song_url || song_title

    const channel = interaction.member.voice.channel

    let songInfo
    try {
      songInfo = await ytdl.getInfo(songSearch)
    } catch (error) {
      await interaction.reply(
        `Não foi possível adicionar essa música na fila :(`
      )
      return
    }

    const song = {
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
    }

    songQueue.add(song)

    const connection = getVoiceConnection(channel.guild.id)

    if (!connection) {
      setupPlayer(channel, song)
    }

    await interaction.reply(
      `A música ${song.title} foi adicionada a fila!\n ${song.url}`
    )
  }
})

const player = createAudioPlayer()

function setupPlayer(channel, song) {
  console.log('Joining at channel:', channel.name)
  console.log(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator)

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  })

  connection.on(VoiceConnectionStatus.Signalling, () => {
    console.log('Signalling')
  })

  connection.on(VoiceConnectionStatus.Connecting, () => {
    console.log('Connecting')
  })

  connection.on(VoiceConnectionStatus.Ready, async () => {
    console.log('Connected!')

    player.on(AudioPlayerStatus.Playing, () => {
      console.log('The audio player has started playing!')
    })

    player.on(AudioPlayerStatus.Idle, () => {
      songQueue.shift()
      if (songQueue.get().length > 0) {
        playSong(player, songQueue.first())
        return
      }
      console.log('The audio player is idle!')
    })

    player.on('error', (error) => {
      console.error(`Error: ${error.message} with resource`)
      playSong(player, songQueue.first())
    })

    playSong(player, song)

    const subscription = connection.subscribe(player)
  })

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.log('Disconnected!')
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ])
    } catch (error) {
      connection.destroy()
    }
  })
}

async function playSong(player, song) {
  const songStream = await ytdl(song.url, { type: 'opus' })
  const resource = createAudioResource(songStream)
  player.play(resource)
}

client.on('message', async (message) => {
  console.log(message.content)
})

client.login(TOKEN)
