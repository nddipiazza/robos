package com.robos.intellij.ipc

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.SocketChannel
import io.netty.channel.socket.nio.NioServerSocketChannel
import io.netty.handler.codec.http.HttpObjectAggregator
import io.netty.handler.codec.http.HttpServerCodec
import java.net.BindException

/**
 * Application-level service that runs a lightweight Netty HTTP server.
 * Default port is 63343; if that port is taken (e.g. by WebStorm's built-in server),
 * the server will try the next 10 ports before giving up.
 *
 * The base port can be overridden with the `ROBOS_IPC_PORT` environment variable.
 * All routing and business logic lives in [RobosIpcHandler].
 */
@Service(Service.Level.APP)
class RobosIpcServer : AutoCloseable {

    companion object {
        val BASE_PORT: Int = System.getenv("ROBOS_IPC_PORT")?.toIntOrNull() ?: 63343
        private val LOG = logger<RobosIpcServer>()
        val JSON: ObjectMapper = ObjectMapper().registerKotlinModule()

        fun instance(): RobosIpcServer =
            ApplicationManager.getApplication().getService(RobosIpcServer::class.java)
    }

    private var bossGroup: NioEventLoopGroup? = null
    private var workerGroup: NioEventLoopGroup? = null
    private var serverChannel: Channel? = null

    @Volatile
    var isRunning: Boolean = false
        private set

    @Volatile
    var boundPort: Int = -1
        private set

    init {
        start()
    }

    fun start() {
        if (isRunning) return

        bossGroup = NioEventLoopGroup(1)
        workerGroup = NioEventLoopGroup(2)

        val bootstrap = ServerBootstrap()
            .group(bossGroup, workerGroup)
            .channel(NioServerSocketChannel::class.java)
            .childHandler(object : ChannelInitializer<SocketChannel>() {
                override fun initChannel(ch: SocketChannel) {
                    ch.pipeline().apply {
                        addLast(HttpServerCodec())
                        addLast(HttpObjectAggregator(1_048_576))
                        addLast(RobosIpcHandler())
                    }
                }
            })

        // Try BASE_PORT..BASE_PORT+9 to avoid conflicts with other JetBrains IDE instances.
        for (port in BASE_PORT until BASE_PORT + 10) {
            try {
                val channel = bootstrap.bind(port).sync().channel()
                serverChannel = channel
                boundPort = port
                isRunning = true
                LOG.info("RobOS IPC server listening on port $port")
                channel.closeFuture().addListener {
                    isRunning = false
                    LOG.info("RobOS IPC server stopped")
                }
                return
            } catch (e: BindException) {
                LOG.info("RobOS IPC: port $port is busy, trying next port")
            } catch (e: Exception) {
                LOG.error("RobOS IPC: unexpected error binding port $port", e)
            }
        }

        LOG.error("RobOS IPC server could not find a free port in range $BASE_PORT..${BASE_PORT + 9}")
        close()
    }

    override fun close() {
        serverChannel?.close()
        workerGroup?.shutdownGracefully()
        bossGroup?.shutdownGracefully()
        isRunning = false
    }
}
