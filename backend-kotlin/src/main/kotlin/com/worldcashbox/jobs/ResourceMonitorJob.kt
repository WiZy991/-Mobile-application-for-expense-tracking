package com.worldcashbox.jobs

import org.quartz.Job
import org.quartz.JobExecutionContext

class ResourceMonitorJob : Job {
    override fun execute(context: JobExecutionContext?) {
        // TODO: Implement resource monitor logic
        println("Resource monitor job executed")
    }
}
