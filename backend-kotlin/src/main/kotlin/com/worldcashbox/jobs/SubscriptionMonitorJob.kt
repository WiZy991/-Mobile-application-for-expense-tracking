package com.worldcashbox.jobs

import org.quartz.Job
import org.quartz.JobExecutionContext

class SubscriptionMonitorJob : Job {
    override fun execute(context: JobExecutionContext?) {
        // TODO: Implement subscription monitor logic
        println("Subscription monitor job executed")
    }
}
